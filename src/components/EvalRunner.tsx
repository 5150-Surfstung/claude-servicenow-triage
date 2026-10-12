"use client";

import { useState } from "react";
import type { EvalReport, CaseResult } from "@/lib/evals/run";
import { ApiError, describeError, postJson, setAccessCode } from "@/lib/client";

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

export function EvalRunner() {
  const [report, setReport] = useState<EvalReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needCode, setNeedCode] = useState(false);
  const [code, setCode] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const r = await postJson<EvalReport>("/api/evals/run", {});
      setReport(r);
      setNeedCode(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setNeedCode(true);
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  const bar = report?.autopilot_bar ?? 0.95;
  const rate = report?.totals.pass_rate ?? 0;
  const cleared = report ? rate >= bar : false;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-prose">
          <h1 className="text-3xl sm:text-4xl font-semibold leading-tight">Does it earn autopilot?</h1>
          <p className="mt-3 text-ink-soft">
            Twenty-six golden cases a property manager would agree on: emergencies, routine fixes, Spanish, three problems in one
            message, and two prompt-injection attempts. A case passes only when category, priority, and routing all match.
            Nothing is written to ServiceNow during an eval run.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <button type="button" onClick={run} disabled={busy} className="rounded-md bg-navy text-cream px-5 py-2.5 font-medium disabled:opacity-50">
            {busy ? "Running 26 cases" : report ? "Run again" : "Run the golden set"}
          </button>
          {error && (
            <p role="alert" className="text-sm text-clay">
              {error}
            </p>
          )}
        </div>
      </div>

      {needCode && (
        <div className="mt-4 max-w-md rounded-md border border-gold bg-gold-soft p-3">
          <label htmlFor="code" className="block text-sm font-medium">
            Access code
          </label>
          <div className="mt-1 flex gap-2">
            <input id="code" value={code} onChange={(e) => setCode(e.target.value)} className="flex-1 rounded-md border border-line bg-paper px-3 py-2" />
            <button
              type="button"
              onClick={() => {
                setAccessCode(code);
                setNeedCode(false);
                setError(null);
              }}
              className="rounded-md bg-navy text-cream px-4 py-2 text-sm"
            >
              Save code
            </button>
          </div>
        </div>
      )}

      {report && (
        <section className="mt-8" aria-label="Results">
          <div className="rounded-md border border-line bg-paper p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="display text-2xl font-semibold">
                {report.totals.passed} of {report.totals.cases} passed, {pct(rate)}
              </p>
              <p className={`text-sm font-medium ${cleared ? "text-ink" : "text-clay"}`}>
                {cleared ? `Clears the ${pct(bar)} autopilot bar` : `Below the ${pct(bar)} autopilot bar: stays in draft mode`}
              </p>
            </div>
            <div className="relative mt-3 h-3 rounded-full bg-cream-2 overflow-hidden" role="img" aria-label={`Pass rate ${pct(rate)}, bar at ${pct(bar)}`}>
              <div className={`h-full ${cleared ? "bg-gold" : "bg-clay"}`} style={{ width: `${rate * 100}%` }} />
              <div className="absolute top-0 h-full w-0.5 bg-navy" style={{ left: `${bar * 100}%` }} title={`Autopilot bar ${pct(bar)}`} />
            </div>
            <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <Stat k="Category" v={pct(report.totals.category_acc)} />
              <Stat k="Priority" v={pct(report.totals.priority_acc)} />
              <Stat k="Routing" v={pct(report.totals.route_acc)} />
              <Stat k="Avg model latency" v={`${report.totals.avg_latency_ms} ms`} />
            </dl>
            <p className="mt-3 text-xs text-ink-soft">
              Model: {report.mode.triager === "fake" ? "fake keyword model (no API key set); these numbers say nothing about Claude" : report.mode.model}.
              {report.mode.triager === "claude" && ` Cache hits ${report.totals.cache_hits} of ${report.totals.cases}; tokens in ${report.totals.input_tokens}, out ${report.totals.output_tokens}.`}
            </p>
          </div>

          <table className="mt-6 w-full text-sm border-t border-line">
            <thead>
              <tr className="text-left text-ink-soft">
                <th className="py-2 pr-3 font-medium">Result</th>
                <th className="py-2 pr-3 font-medium">Message</th>
                <th className="py-2 pr-3 font-medium">Expected</th>
                <th className="py-2 pr-3 font-medium">Got</th>
              </tr>
            </thead>
            <tbody>
              {report.results.map((r) => (
                <Row key={r.id} r={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} />
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-ink-soft">{k}</dt>
      <dd className="text-lg font-medium">{v}</dd>
    </div>
  );
}

function Row({ r, open, onToggle }: { r: CaseResult; open: boolean; onToggle: () => void }) {
  const exp = `${r.expected.categories.join("/")}${r.expected.priority ? `, P${r.expected.priority}${r.expected.priority_tolerance ? "±" + r.expected.priority_tolerance : ""}` : ""}, ${r.expected.route}`;
  const got = r.got.category ? `${r.got.category}, P${r.got.priority} @${r.got.confidence?.toFixed(2)}, ${r.got.route}` : r.error ?? "no result";
  return (
    <>
      <tr className="border-t border-line align-top cursor-pointer hover:bg-paper" onClick={onToggle}>
        <td className="py-2 pr-3">
          <span className={`inline-block rounded-sm px-2 py-0.5 text-xs font-medium ${r.pass ? "bg-gold-soft text-ink" : "bg-clay-soft text-clay"}`}>{r.pass ? "pass" : "miss"}</span>
        </td>
        <td className="py-2 pr-3 max-w-md">
          <span className="text-ink-soft">{r.tags.join(", ")}</span>
          <span className="block">{r.text}</span>
        </td>
        <td className="py-2 pr-3 whitespace-nowrap">{exp}</td>
        <td className="py-2 pr-3 whitespace-nowrap">{got}</td>
      </tr>
      {open && (
        <tr className="bg-paper">
          <td colSpan={4} className="px-3 py-3 text-sm">
            <ul className="space-y-1">
              <li>Category {r.checks.category ? "matched" : "missed"}; priority {r.checks.priority === null ? "not scored" : r.checks.priority ? "matched" : "missed"}; route {r.checks.route ? "matched" : "missed"}{r.checks.language !== null && `; language ${r.checks.language ? "matched" : "missed"}`}.</li>
              {r.got.reasons.map((x) => (
                <li key={x} className="text-ink-soft">
                  – {x}
                </li>
              ))}
              <li className="text-ink-soft">Model latency {r.latency_ms} ms{r.cache_hit ? ", prompt cache hit" : ""}</li>
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}
