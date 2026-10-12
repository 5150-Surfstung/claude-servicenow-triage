"use client";

import { useState } from "react";
import type { TriageTrace } from "@/lib/pipeline";
import { PRIORITY_LABEL } from "@/lib/schema";
import { PipelineStrip, type StripStage } from "./PipelineStrip";

function ms(n: number) {
  return n < 1000 ? `${n} ms` : `${(n / 1000).toFixed(1)} s`;
}

export function stagesFor(trace: TriageTrace): StripStage[] {
  const t = trace.triage.ok ? trace.triage.result : null;
  const sn = trace.incident;
  return [
    { key: "intake", label: "Intake", state: trace.guardrails.input_injection ? "warn" : "done", note: `${trace.input.chars} chars` },
    { key: "model", label: "Model", state: trace.triage.ok ? "done" : "fail", note: t ? `${t.category}, P${t.priority}` : trace.triage.ok ? "" : "unavailable" },
    { key: "guard", label: "Guardrails", state: trace.guardrails.reply_violations.length ? "warn" : "done", note: trace.guardrails.reply_violations.length ? "reply held" : "clean" },
    { key: "gate", label: "Gate", state: trace.gate.route === "auto" ? "done" : "warn", note: trace.gate.route === "auto" ? "auto" : "person" },
    {
      key: "sn",
      label: "ServiceNow",
      state: sn.status === "created" || sn.status === "replayed" ? "done" : sn.status === "failed" ? "fail" : "idle",
      note: sn.status === "created" || sn.status === "replayed" ? sn.ref.number : sn.status === "failed" ? sn.code : "dry run",
    },
  ];
}

export function Trace({ trace, latest }: { trace: TriageTrace; latest: boolean }) {
  const [showJson, setShowJson] = useState(false);
  const t = trace.triage.ok ? trace.triage.result : null;
  const auto = trace.gate.route === "auto";
  const anim = (i: number, base = "") => ({
    className: `${base} ${latest ? "stage-enter" : ""}`.trim(),
    style: latest ? { animationDelay: `${i * 110}ms` } : undefined,
  });

  return (
    <article className={latest ? "" : "opacity-70"} aria-label={`Trace ${trace.request_id}`}>
      <header {...anim(0, "flex flex-wrap items-baseline justify-between gap-2 text-sm text-cream/60")}>
        <p>
          {trace.input.unit ? `Unit ${trace.input.unit}, ` : ""}
          {trace.input.channel ?? "message"}, {trace.input.chars} characters
        </p>
        <p>{new Date(trace.received_at).toLocaleTimeString()}</p>
      </header>

      <div {...anim(0, "mt-3")}>
        <PipelineStrip stages={stagesFor(trace)} />
      </div>

      <blockquote {...anim(1, "mt-5 border-l-2 border-gold/70 pl-3 text-cream/85 italic")}>
        {trace.input.text}
      </blockquote>

      {/* Verdict: the one loud element */}
      <div {...anim(3, `mt-5 rounded-md p-5 ${auto ? "bg-gold text-navy-deep" : "bg-clay text-cream"}`)}>
        <p className="display text-3xl sm:text-4xl font-semibold leading-none">{auto ? "Routed automatically" : "Needs a person"}</p>
        {t && (
          <p className="mt-2 text-lg">
            {t.category}, priority {t.priority}: {PRIORITY_LABEL[t.priority]}
            {trace.gate.emergency && (
              <span className={`ml-2 rounded-sm px-2 py-0.5 text-sm align-middle ${auto ? "bg-navy-deep text-gold" : "bg-cream text-clay"}`}>Emergency</span>
            )}
          </p>
        )}
        <ul className="mt-3 space-y-1 text-sm">
          {trace.gate.reasons.map((r) => (
            <li key={r} className="flex gap-2">
              <span aria-hidden className="opacity-60">
                –
              </span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Stage ledger */}
      <dl className="mt-6 divide-y divide-cream/10 border-y border-cream/10">
        <Stage label="Model" meta={trace.triage.latency_ms ? ms(trace.triage.latency_ms) : ""} {...anim(2)}>
          {trace.triage.ok && t ? (
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Field k="Confidence" v={`${t.confidence.toFixed(2)} (gate at ${trace.gate.threshold.toFixed(2)})`} />
              <Field k="Language" v={t.language} />
              <Field k="Work order title" v={t.summary} wide />
              <Field k="Details for the tech" v={t.details} wide />
              {t.needs_info.length > 0 && <Field k="Still need to ask" v={t.needs_info.join("; ")} wide />}
              <Field k="Why" v={t.reasoning} wide />
              <Field k="Injection flag" v={t.injection_suspected ? "model flagged this message" : "none"} />
              <Field k="Source" v={trace.mode.triager === "fake" ? "fake keyword model (no API key set)" : trace.mode.model} />
            </div>
          ) : !trace.triage.ok ? (
            <p className="text-sm text-clay-soft">
              Model step failed ({trace.triage.error}). Intake was kept: the incident is created for a person to triage.
              <span className="block text-cream/60 mt-1">{trace.triage.detail}</span>
            </p>
          ) : null}
        </Stage>

        <Stage label="Guardrails" {...anim(2)}>
          <ul className="text-sm space-y-1">
            <li>Input scan: {trace.guardrails.input_injection ? "instruction-like text found" : "clean"}</li>
            <li>
              Draft reply scan:{" "}
              {trace.guardrails.reply_violations.length ? `blocked (${trace.guardrails.reply_violations.join(", ")})` : "clean"}
            </li>
          </ul>
        </Stage>

        {t && (
          <Stage label="Draft reply to tenant" {...anim(4)}>
            <p className="text-sm">{t.tenant_reply}</p>
            <p className="mt-1 text-xs text-cream/60">{auto ? "Would send on the tenant's channel." : "Held as a draft until a person approves."}</p>
          </Stage>
        )}

        <Stage label="ServiceNow" meta={trace.timing.servicenow_ms ? ms(trace.timing.servicenow_ms) : ""} {...anim(5)}>
          {trace.incident.status === "created" || trace.incident.status === "replayed" ? (
            <p className="text-sm">
              <span className="font-mono text-gold">{trace.incident.ref.number}</span>
              {trace.incident.status === "replayed" ? " already existed for this message, returned instead of duplicating" : " created"}, impact{" "}
              {trace.incident.impact}, urgency {trace.incident.urgency}
              {trace.mode.servicenow === "live" ? (
                <>
                  {" "}
                  <a className="underline text-gold" href={trace.incident.ref.url} target="_blank" rel="noreferrer">
                    open in ServiceNow
                  </a>
                </>
              ) : (
                <span className="text-cream/60"> (mock store)</span>
              )}
            </p>
          ) : trace.incident.status === "skipped" ? (
            <p className="text-sm text-cream/60">Skipped (dry run).</p>
          ) : trace.incident.status === "failed" ? (
            <p className="text-sm text-clay-soft">
              Incident not created ({trace.incident.code}). {trace.incident.detail}
            </p>
          ) : null}
        </Stage>

        <Stage label="Telemetry" {...anim(6)}>
          <p className="text-sm">
            Total {ms(trace.timing.total_ms)}; model {ms(trace.timing.llm_ms)}; ServiceNow {ms(trace.timing.servicenow_ms)}.
            {trace.triage.ok && trace.mode.triager === "claude" && (
              <>
                {" "}
                Tokens in {trace.triage.usage.input_tokens + trace.triage.usage.cache_read_input_tokens + trace.triage.usage.cache_creation_input_tokens}, out{" "}
                {trace.triage.usage.output_tokens}.{" "}
                {trace.triage.cache_hit
                  ? `Prompt cache hit (${trace.triage.usage.cache_read_input_tokens} tokens read from cache).`
                  : trace.triage.usage.cache_creation_input_tokens > 0
                    ? "Prompt cache written; the next call reads it."
                    : "No cache activity."}
                {trace.triage.cost_usd !== null && ` Est. $${trace.triage.cost_usd.toFixed(4)}.`}
              </>
            )}
          </p>
          <p className="mt-1 text-xs text-cream/50 font-mono">{trace.request_id}</p>
        </Stage>
      </dl>

      <button type="button" onClick={() => setShowJson((v) => !v)} className="mt-3 text-sm underline text-gold">
        {showJson ? "Hide raw trace" : "Show raw trace"}
      </button>
      {showJson && <pre className="mt-2 max-h-96 overflow-auto rounded-md bg-black/30 text-cream/90 text-xs p-4 font-mono">{JSON.stringify(trace, null, 2)}</pre>}
    </article>
  );
}

function Stage({
  label,
  meta,
  children,
  className = "",
  style,
}: {
  label: string;
  meta?: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`grid sm:grid-cols-[9rem_1fr] gap-x-4 py-4 ${className}`} style={style}>
      <dt className="text-sm font-medium text-cream">
        {label}
        {meta ? <span className="block text-xs text-cream/50 font-normal">{meta}</span> : null}
      </dt>
      <dd className="min-w-0 mt-1 sm:mt-0 text-cream/90">{children}</dd>
    </div>
  );
}

function Field({ k, v, wide }: { k: string; v: string; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <span className="text-cream/55">{k}: </span>
      <span>{v}</span>
    </div>
  );
}
