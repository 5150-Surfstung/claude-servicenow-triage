"use client";

import { useState } from "react";
import type { TriageTrace } from "@/lib/pipeline";
import { PRIORITY_LABEL } from "@/lib/schema";

function ms(n: number) {
  return n < 1000 ? `${n} ms` : `${(n / 1000).toFixed(1)} s`;
}

export function Trace({ trace, latest }: { trace: TriageTrace; latest: boolean }) {
  const [showJson, setShowJson] = useState(false);
  const t = trace.triage.ok ? trace.triage.result : null;
  const auto = trace.gate.route === "auto";
  const verdictBg = auto ? "bg-gold-soft border-gold" : "bg-clay-soft border-clay";
  const verdictText = auto ? "Routed automatically" : "Needs a person";

  return (
    <article className={`${latest ? "stage-enter" : "opacity-80"}`} aria-label={`Trace ${trace.request_id}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2">
        <p className="text-sm text-ink-soft">
          {trace.input.unit ? `Unit ${trace.input.unit}, ` : ""}
          {trace.input.channel ?? "message"}, {trace.input.chars} characters
        </p>
        <p className="text-sm text-ink-soft">{new Date(trace.received_at).toLocaleTimeString()}</p>
      </header>

      <blockquote className="mt-3 border-l-2 border-line pl-3 text-ink-soft italic">{trace.input.text}</blockquote>

      {/* Verdict: the one loud element */}
      <div className={`mt-5 rounded-md border-2 ${verdictBg} p-5`}>
        <p className="display text-2xl sm:text-3xl font-semibold">{verdictText}</p>
        {t && (
          <p className="mt-1 text-lg">
            {t.category}, priority {t.priority}: {PRIORITY_LABEL[t.priority]}
            {trace.gate.emergency && <span className="ml-2 rounded-sm bg-clay text-cream px-2 py-0.5 text-sm align-middle">Emergency</span>}
          </p>
        )}
        <ul className="mt-3 space-y-1 text-sm">
          {trace.gate.reasons.map((r) => (
            <li key={r} className="flex gap-2">
              <span aria-hidden className="text-ink-soft">
                –
              </span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Stage ledger */}
      <dl className="mt-6 divide-y divide-line border-y border-line">
        <Stage label="Model" meta={`${trace.triage.latency_ms ? ms(trace.triage.latency_ms) : ""}`}>
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
            <p className="text-sm text-clay">
              Model step failed ({trace.triage.error}). Intake was kept: the incident is created for a person to triage.
              <span className="block text-ink-soft mt-1">{trace.triage.detail}</span>
            </p>
          ) : null}
        </Stage>

        <Stage label="Guardrails">
          <ul className="text-sm space-y-1">
            <li>Input scan: {trace.guardrails.input_injection ? "instruction-like text found" : "clean"}</li>
            <li>
              Draft reply scan:{" "}
              {trace.guardrails.reply_violations.length ? `blocked (${trace.guardrails.reply_violations.join(", ")})` : "clean"}
            </li>
          </ul>
        </Stage>

        {t && (
          <Stage label="Draft reply to tenant">
            <p className="text-sm">{t.tenant_reply}</p>
            <p className="mt-1 text-xs text-ink-soft">
              {auto ? "Would send on the tenant's channel." : "Held as a draft until a person approves."}
            </p>
          </Stage>
        )}

        <Stage label="ServiceNow" meta={trace.timing.servicenow_ms ? ms(trace.timing.servicenow_ms) : ""}>
          {trace.incident.status === "created" || trace.incident.status === "replayed" ? (
            <p className="text-sm">
              <span className="font-mono">{trace.incident.ref.number}</span>
              {trace.incident.status === "replayed" ? " already existed for this message, returned instead of duplicating" : " created"}, impact{" "}
              {trace.incident.impact}, urgency {trace.incident.urgency}
              {trace.mode.servicenow === "live" ? (
                <>
                  {" "}
                  <a className="underline text-navy" href={trace.incident.ref.url} target="_blank" rel="noreferrer">
                    open in ServiceNow
                  </a>
                </>
              ) : (
                <span className="text-ink-soft"> (mock store)</span>
              )}
            </p>
          ) : trace.incident.status === "skipped" ? (
            <p className="text-sm text-ink-soft">Skipped (dry run).</p>
          ) : trace.incident.status === "failed" ? (
            <p className="text-sm text-clay">
              Incident not created ({trace.incident.code}). {trace.incident.detail}
            </p>
          ) : null}
        </Stage>

        <Stage label="Telemetry">
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
          <p className="mt-1 text-xs text-ink-soft font-mono">{trace.request_id}</p>
        </Stage>
      </dl>

      <button type="button" onClick={() => setShowJson((v) => !v)} className="mt-3 text-sm underline text-navy">
        {showJson ? "Hide raw trace" : "Show raw trace"}
      </button>
      {showJson && (
        <pre className="mt-2 max-h-96 overflow-auto rounded-md bg-navy-deep text-cream text-xs p-4 font-mono">{JSON.stringify(trace, null, 2)}</pre>
      )}
    </article>
  );
}

function Stage({ label, meta, children }: { label: string; meta?: string; children: React.ReactNode }) {
  return (
    <div className="grid sm:grid-cols-[9rem_1fr] gap-x-4 py-4">
      <dt className="text-sm font-medium">
        {label}
        {meta ? <span className="block text-xs text-ink-soft font-normal">{meta}</span> : null}
      </dt>
      <dd className="min-w-0 mt-1 sm:mt-0">{children}</dd>
    </div>
  );
}

function Field({ k, v, wide }: { k: string; v: string; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <span className="text-ink-soft">{k}: </span>
      <span>{v}</span>
    </div>
  );
}
