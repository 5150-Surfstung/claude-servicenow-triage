import { runTriage, type TriageTrace } from "../pipeline";
import type { Triager } from "../claude";
import { GOLDEN, type GoldenCase } from "./golden";

export interface CaseResult {
  id: string;
  tags: string[];
  text: string;
  pass: boolean;
  checks: { category: boolean; priority: boolean | null; route: boolean; language: boolean | null };
  expected: GoldenCase["expect"];
  got: { category: string | null; priority: number | null; confidence: number | null; route: string; language: string | null; reasons: string[] };
  latency_ms: number;
  cache_hit: boolean | null;
  error?: string;
}

export interface EvalReport {
  started_at: string;
  finished_at: string;
  mode: TriageTrace["mode"];
  autopilot_bar: number; // pass rate required before autopilot is trusted
  totals: {
    cases: number;
    passed: number;
    pass_rate: number;
    category_acc: number;
    priority_acc: number;
    route_acc: number;
    avg_latency_ms: number;
    cache_hits: number;
    input_tokens: number;
    output_tokens: number;
  };
  results: CaseResult[];
}

export const AUTOPILOT_BAR = 0.95;

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

export function scoreCase(c: GoldenCase, trace: TriageTrace): CaseResult {
  const t = trace.triage.ok ? trace.triage.result : null;
  const category = t?.category ?? null;
  const priority = t?.priority ?? null;
  const categoryOk = category !== null && (c.expect.categories as string[]).includes(category);
  const priorityOk =
    c.expect.priority === null ? null : priority !== null && Math.abs(priority - c.expect.priority) <= (c.expect.priority_tolerance ?? 0);
  const routeOk = c.expect.route === "any" ? true : trace.gate.route === c.expect.route;
  const languageOk = c.expect.language ? (t?.language ?? "").toLowerCase().startsWith(c.expect.language) : null;
  const pass = categoryOk && (priorityOk ?? true) && routeOk && (languageOk ?? true);
  return {
    id: c.id,
    tags: c.tags,
    text: c.text,
    pass,
    checks: { category: categoryOk, priority: priorityOk, route: routeOk, language: languageOk },
    expected: c.expect,
    got: {
      category,
      priority,
      confidence: t?.confidence ?? null,
      route: trace.gate.route,
      language: t?.language ?? null,
      reasons: trace.gate.reasons,
    },
    latency_ms: trace.timing.llm_ms,
    cache_hit: trace.triage.ok ? trace.triage.cache_hit : null,
    error: trace.triage.ok ? undefined : `${trace.triage.error}: ${trace.triage.detail}`,
  };
}

export async function runEvals(opts: { cases?: GoldenCase[]; concurrency?: number; triager?: Triager } = {}): Promise<EvalReport> {
  const cases = opts.cases ?? GOLDEN;
  const started_at = new Date().toISOString();
  let mode: TriageTrace["mode"] | undefined;
  let input_tokens = 0;
  let output_tokens = 0;

  const results = await mapLimit(cases, opts.concurrency ?? 4, async (c) => {
    const res = await runTriage({ text: c.text, unit: c.unit, channel: c.channel, dry_run: true, idempotency_key: `eval-${c.id}` }, { triager: opts.triager });
    if (!res.ok) {
      return {
        id: c.id, tags: c.tags, text: c.text, pass: false,
        checks: { category: false, priority: null, route: false, language: null },
        expected: c.expect,
        got: { category: null, priority: null, confidence: null, route: "human", language: null, reasons: [res.body.error] },
        latency_ms: 0, cache_hit: null, error: res.body.error,
      } satisfies CaseResult;
    }
    mode ??= res.trace.mode;
    if (res.trace.triage.ok) {
      input_tokens += res.trace.triage.usage.input_tokens + res.trace.triage.usage.cache_read_input_tokens + res.trace.triage.usage.cache_creation_input_tokens;
      output_tokens += res.trace.triage.usage.output_tokens;
    }
    return scoreCase(c, res.trace);
  });

  const n = results.length;
  const passed = results.filter((r) => r.pass).length;
  const scoredPriority = results.filter((r) => r.checks.priority !== null);
  const totals = {
    cases: n,
    passed,
    pass_rate: n ? passed / n : 0,
    category_acc: n ? results.filter((r) => r.checks.category).length / n : 0,
    priority_acc: scoredPriority.length ? scoredPriority.filter((r) => r.checks.priority).length / scoredPriority.length : 0,
    route_acc: n ? results.filter((r) => r.checks.route).length / n : 0,
    avg_latency_ms: n ? Math.round(results.reduce((a, r) => a + r.latency_ms, 0) / n) : 0,
    cache_hits: results.filter((r) => r.cache_hit).length,
    input_tokens,
    output_tokens,
  };

  return {
    started_at,
    finished_at: new Date().toISOString(),
    mode: mode ?? { triager: "fake", model: "fake-keyword-v1", servicenow: "mock", threshold: 0.8 },
    autopilot_bar: AUTOPILOT_BAR,
    totals,
    results,
  };
}
