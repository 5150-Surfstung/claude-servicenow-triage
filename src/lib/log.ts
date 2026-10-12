/**
 * Structured logs and in-process RED metrics.
 * One JSON line per request boundary; a log drain (Vercel, Datadog, Dynatrace) can parse it as is.
 */

export function log(event: string, fields: Record<string, unknown>): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), event, ...fields });
  if (fields.level === "error") console.error(line);
  else console.log(line);
}

const WINDOW = 500;
const state = {
  started_at: new Date().toISOString(),
  requests: 0,
  errors: 0,
  routes: { auto: 0, human: 0 } as Record<string, number>,
  latencies: [] as number[],
};

export function recordRequest(opts: { latency_ms: number; error: boolean; route?: string }): void {
  state.requests += 1;
  if (opts.error) state.errors += 1;
  if (opts.route) state.routes[opts.route] = (state.routes[opts.route] ?? 0) + 1;
  state.latencies.push(opts.latency_ms);
  if (state.latencies.length > WINDOW) state.latencies.shift();
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

export function metricsSnapshot() {
  const sorted = [...state.latencies].sort((a, b) => a - b);
  return {
    started_at: state.started_at,
    requests: state.requests,
    errors: state.errors,
    error_rate: state.requests ? Number((state.errors / state.requests).toFixed(3)) : 0,
    routes: { ...state.routes },
    latency_ms: { p50: percentile(sorted, 50), p95: percentile(sorted, 95), window: sorted.length },
  };
}
