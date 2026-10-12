import type { Triage } from "./schema";

export const DEFAULT_THRESHOLD = 0.8;

export type Route = "auto" | "human";

export interface GateInput {
  triage: Triage | null;
  triageError?: string; // llm_unavailable | schema_invalid | no_tool_call
  injectionHeuristic: boolean;
  replyViolations: string[];
  threshold: number;
}

export interface GateDecision {
  route: Route;
  reasons: string[]; // human-readable, in the order they were evaluated
  emergency: boolean;
  confidence: number | null;
  threshold: number;
}

/**
 * Deterministic routing. Code decides, not the prompt: the model proposes, the gate disposes.
 *
 *  auto  = incident is created, categorized and prioritized, and routed without a person looking first
 *  human = incident is still created (intake is never blocked), but flagged "needs review" and left unassigned
 */
export function decideRoute(input: GateInput): GateDecision {
  const reasons: string[] = [];
  const t = input.triage;

  if (!t) {
    reasons.push(input.triageError === "llm_unavailable" ? "model unavailable, intake kept" : `model output rejected (${input.triageError ?? "unknown"})`);
    return { route: "human", reasons, emergency: false, confidence: null, threshold: input.threshold };
  }

  const emergency = t.emergency || t.priority === 1;

  if (input.injectionHeuristic) reasons.push("instruction-like text detected in message");
  if (t.injection_suspected) reasons.push("model flagged possible injection");
  for (const v of input.replyViolations) reasons.push(`draft reply failed guardrail: ${v}`);
  if (t.category === "other") reasons.push("category could not be determined");
  if (t.confidence < input.threshold) reasons.push(`confidence ${t.confidence.toFixed(2)} below ${input.threshold.toFixed(2)}`);

  const route: Route = reasons.length === 0 ? "auto" : "human";
  if (route === "auto") reasons.push(`confidence ${t.confidence.toFixed(2)} at or above ${input.threshold.toFixed(2)}, no guardrail hits`);
  if (emergency) reasons.push("emergency: on-call must phone the tenant");

  return { route, reasons, emergency, confidence: t.confidence, threshold: input.threshold };
}

export function thresholdFromEnv(): number {
  const v = Number(process.env.TRIAGE_CONFIDENCE_THRESHOLD);
  return Number.isFinite(v) && v > 0 && v <= 1 ? v : DEFAULT_THRESHOLD;
}
