import { createHash } from "node:crypto";
import { ClaudeTriager, DEFAULT_MODEL, estimateCostUsd, type Triager, type TriageOutcome, type Usage } from "./claude";
import { FakeTriager } from "./fake-triager";
import { checkInput, checkReply } from "./guardrails";
import { decideRoute, thresholdFromEnv, type GateDecision } from "./gate";
import { getIncidentClient, ServiceNowError, type IncidentClient, type IncidentRef } from "./servicenow";
import { PRIORITY_LABEL, toServiceNowImpactUrgency, type Triage } from "./schema";
import { log, recordRequest } from "./log";

export interface PipelineInput {
  text: string;
  unit?: string;
  channel?: "sms" | "email" | "web" | "phone";
  idempotency_key?: string;
  dry_run?: boolean; // evaluate but do not touch ServiceNow (used by evals)
}

export interface TriageTrace {
  request_id: string;
  received_at: string;
  mode: { triager: "claude" | "fake"; model: string; servicenow: "mock" | "live"; threshold: number };
  input: { text: string; unit?: string; channel?: string; chars: number };
  guardrails: { input_injection: boolean; reply_violations: string[] };
  triage:
    | { ok: true; result: Triage; latency_ms: number; usage: Usage; cost_usd: number | null; cache_hit: boolean }
    | { ok: false; error: string; detail: string; latency_ms: number };
  gate: GateDecision;
  incident:
    | { status: "created" | "replayed"; ref: IncidentRef; impact: number; urgency: number }
    | { status: "skipped"; reason: "dry_run" }
    | { status: "failed"; code: string; detail: string };
  timing: { total_ms: number; llm_ms: number; servicenow_ms: number };
}

export type PipelineError = { error: "empty" | "too_long"; max_chars?: number };

let triagerSingleton: Triager | undefined;
export function getTriager(): Triager {
  if (triagerSingleton) return triagerSingleton;
  const key = process.env.ANTHROPIC_API_KEY;
  const forceFake = process.env.TRIAGE_MODE === "fake";
  triagerSingleton =
    key && !forceFake ? new ClaudeTriager({ apiKey: key, model: process.env.TRIAGE_MODEL ?? DEFAULT_MODEL }) : new FakeTriager();
  return triagerSingleton;
}

export function requestIdFor(input: PipelineInput): string {
  if (input.idempotency_key) return `sn-triage:${input.idempotency_key.slice(0, 64)}`;
  const norm = input.text.trim().replace(/\s+/g, " ").toLowerCase();
  const h = createHash("sha256").update(`${norm}|${input.unit ?? ""}|${input.channel ?? ""}`).digest("hex");
  return `sn-triage:${h.slice(0, 32)}`;
}

function workNotes(trace: Pick<TriageTrace, "mode" | "gate" | "guardrails"> & { triage: Triage | null; outcome: TriageOutcome }): string {
  const lines: string[] = [];
  lines.push(`AI triage (${trace.mode.triager === "fake" ? "fake model, no API key" : trace.mode.model})`);
  lines.push(`Route: ${trace.gate.route.toUpperCase()}${trace.gate.emergency ? " / EMERGENCY" : ""}`);
  for (const r of trace.gate.reasons) lines.push(`- ${r}`);
  if (trace.triage) {
    lines.push(`Category: ${trace.triage.category}; priority ${trace.triage.priority} (${PRIORITY_LABEL[trace.triage.priority]}); confidence ${trace.triage.confidence.toFixed(2)}`);
    if (trace.triage.needs_info.length) lines.push(`Needs info: ${trace.triage.needs_info.join("; ")}`);
    lines.push(`Reasoning: ${trace.triage.reasoning}`);
    lines.push(`Draft tenant reply (${trace.triage.language}): ${trace.triage.tenant_reply}`);
  } else if (!trace.outcome.ok) {
    lines.push(`Model error: ${trace.outcome.error}: ${trace.outcome.detail.slice(0, 300)}`);
  }
  return lines.join("\n");
}

export async function runTriage(
  input: PipelineInput,
  deps: { triager?: Triager; incidents?: IncidentClient; threshold?: number } = {}
): Promise<{ ok: true; trace: TriageTrace } | { ok: false; status: 400; body: PipelineError }> {
  const started = Date.now();
  const check = checkInput(input.text);
  if (!check.ok) {
    return { ok: false, status: 400, body: { error: check.error!, max_chars: check.error === "too_long" ? 4000 : undefined } };
  }

  const triager = deps.triager ?? getTriager();
  const incidents = deps.incidents ?? getIncidentClient();
  const threshold = deps.threshold ?? thresholdFromEnv();
  const request_id = requestIdFor(input);
  const text = input.text.trim();

  const outcome = await triager.triage({ text, unit: input.unit, channel: input.channel });
  const triage = outcome.ok ? outcome.triage : null;

  const reply = triage ? checkReply(triage.tenant_reply) : { ok: true, violations: [], reasons: [] };
  const gate = decideRoute({
    triage,
    triageError: outcome.ok ? undefined : outcome.error,
    injectionHeuristic: check.injection_suspected,
    replyViolations: reply.reasons,
    threshold,
  });

  const mode = { triager: triager.source, model: triager.model, servicenow: incidents.mode, threshold } as const;
  const guardrails = { input_injection: check.injection_suspected, reply_violations: reply.violations };

  let incident: TriageTrace["incident"];
  let servicenow_ms = 0;
  if (input.dry_run) {
    incident = { status: "skipped", reason: "dry_run" };
  } else {
    const snStart = Date.now();
    const pri = triage?.priority ?? 2; // unknown severity defaults to urgent, never low
    const { impact, urgency } = toServiceNowImpactUrgency(pri);
    try {
      const ref = await incidents.createIncident({
        correlation_id: request_id,
        short_description: triage?.summary ?? `${input.unit ? input.unit + ": " : ""}maintenance request (AI triage unavailable)`,
        description: [triage?.details ?? text, "", "Original message:", text].join("\n"),
        category: triage?.category ?? "other",
        impact,
        urgency,
        needs_review: gate.route === "human",
        contact_type: input.channel === "sms" ? "phone" : input.channel === "email" ? "email" : "self-service",
        work_notes: workNotes({ mode, gate, guardrails, triage, outcome }),
      });
      incident = { status: ref.replayed ? "replayed" : "created", ref, impact, urgency };
    } catch (err) {
      const code = err instanceof ServiceNowError ? err.code : "unexpected";
      incident = { status: "failed", code, detail: err instanceof Error ? err.message : String(err) };
    }
    servicenow_ms = Date.now() - snStart;
  }

  const trace: TriageTrace = {
    request_id,
    received_at: new Date(started).toISOString(),
    mode,
    input: { text, unit: input.unit, channel: input.channel, chars: text.length },
    guardrails,
    triage: outcome.ok
      ? {
          ok: true,
          result: outcome.triage,
          latency_ms: outcome.latency_ms,
          usage: outcome.usage,
          cost_usd: estimateCostUsd(outcome.usage),
          cache_hit: outcome.usage.cache_read_input_tokens > 0,
        }
      : { ok: false, error: outcome.error, detail: outcome.detail, latency_ms: outcome.latency_ms },
    gate,
    incident,
    timing: { total_ms: Date.now() - started, llm_ms: outcome.latency_ms, servicenow_ms },
  };

  const failed = !outcome.ok || incident.status === "failed";
  recordRequest({ latency_ms: trace.timing.total_ms, error: failed, route: gate.route });
  log("triage.completed", {
    level: failed ? "error" : "info",
    request_id,
    triager: mode.triager,
    model: mode.model,
    servicenow: mode.servicenow,
    route: gate.route,
    emergency: gate.emergency,
    category: triage?.category ?? null,
    priority: triage?.priority ?? null,
    confidence: triage?.confidence ?? null,
    injection: guardrails.input_injection || triage?.injection_suspected || false,
    reply_violations: guardrails.reply_violations,
    triage_error: outcome.ok ? null : outcome.error,
    usage: outcome.ok ? outcome.usage : null,
    cache_hit: outcome.ok ? outcome.usage.cache_read_input_tokens > 0 : null,
    incident: incident.status,
    incident_number: incident.status === "created" || incident.status === "replayed" ? incident.ref.number : null,
    incident_error: incident.status === "failed" ? incident.code : null,
    llm_ms: outcome.latency_ms,
    servicenow_ms,
    total_ms: trace.timing.total_ms,
  });

  return { ok: true, trace };
}
