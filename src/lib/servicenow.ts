/**
 * ServiceNow incident adapter.
 *
 * Live mode talks to the Table API on a Personal Developer Instance (or any instance)
 * with Basic auth. Mock mode keeps incidents in memory so the pipeline runs end to end
 * without an instance. Both honor the same idempotency contract: an incident is keyed
 * by `correlation_id`, so replaying the same request returns the existing incident.
 *
 * Production notes (not implemented here on purpose):
 *  - swap Basic auth for an OAuth client-credentials grant scoped to the incident table
 *  - put creation behind an outbox with a UNIQUE(correlation_id) so a concurrent replay
 *    cannot double-create between the lookup and the insert
 */

export interface IncidentInput {
  correlation_id: string;
  short_description: string;
  description: string;
  category: string;
  impact: 1 | 2 | 3;
  urgency: 1 | 2 | 3;
  work_notes: string;
  needs_review: boolean;
  contact_type?: string;
}

export interface IncidentRef {
  sys_id: string;
  number: string;
  url: string;
  replayed: boolean;
}

export interface IncidentClient {
  readonly mode: "mock" | "live";
  findByCorrelationId(correlation_id: string): Promise<IncidentRef | null>;
  createIncident(input: IncidentInput): Promise<IncidentRef>;
  ping(): Promise<{ ok: boolean; detail: string; latency_ms: number }>;
}

export class ServiceNowError extends Error {
  constructor(
    public readonly code: "auth" | "rate_limited" | "unavailable" | "bad_request" | "timeout" | "unexpected",
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "ServiceNowError";
  }
}

/* ---------------------------------- mock ---------------------------------- */

export class MockIncidentClient implements IncidentClient {
  readonly mode = "mock" as const;
  private seq = 10001;
  private store = new Map<string, IncidentRef & { input: IncidentInput; created_at: string }>();

  async findByCorrelationId(correlation_id: string): Promise<IncidentRef | null> {
    const hit = this.store.get(correlation_id);
    return hit ? { sys_id: hit.sys_id, number: hit.number, url: hit.url, replayed: true } : null;
  }

  async createIncident(input: IncidentInput): Promise<IncidentRef> {
    const existing = await this.findByCorrelationId(input.correlation_id);
    if (existing) return existing;
    const number = `INC${String(this.seq++).padStart(7, "0")}`;
    const sys_id = cryptoRandomHex(32);
    const ref = { sys_id, number, url: `#mock/${number}`, replayed: false };
    this.store.set(input.correlation_id, { ...ref, input, created_at: new Date().toISOString() });
    return ref;
  }

  async ping() {
    return { ok: true, detail: "mock store, in memory", latency_ms: 0 };
  }

  /** Test helper. */
  all() {
    return [...this.store.values()];
  }
}

function cryptoRandomHex(len: number): string {
  const bytes = new Uint8Array(len / 2);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ---------------------------------- live ---------------------------------- */

export interface ServiceNowConfig {
  instanceUrl: string; // https://devXXXXX.service-now.com
  username: string;
  password: string;
  timeoutMs?: number;
  maxAttempts?: number;
}

type SnRecord = { sys_id: string; number: string };

export class ServiceNowIncidentClient implements IncidentClient {
  readonly mode = "live" as const;
  private base: string;
  private auth: string;
  private timeoutMs: number;
  private maxAttempts: number;

  constructor(cfg: ServiceNowConfig) {
    this.base = cfg.instanceUrl.replace(/\/+$/, "");
    this.auth = "Basic " + Buffer.from(`${cfg.username}:${cfg.password}`).toString("base64");
    this.timeoutMs = cfg.timeoutMs ?? 10_000;
    this.maxAttempts = cfg.maxAttempts ?? 3;
  }

  private incidentUrl(sys_id: string) {
    return `${this.base}/nav_to.do?uri=incident.do?sys_id=${encodeURIComponent(sys_id)}`;
  }

  async findByCorrelationId(correlation_id: string): Promise<IncidentRef | null> {
    const q = new URLSearchParams({
      sysparm_query: `correlation_id=${correlation_id}`,
      sysparm_fields: "sys_id,number",
      sysparm_limit: "1",
    });
    const data = await this.request<{ result: SnRecord[] }>("GET", `/api/now/table/incident?${q}`);
    const rec = data.result?.[0];
    return rec ? { sys_id: rec.sys_id, number: rec.number, url: this.incidentUrl(rec.sys_id), replayed: true } : null;
  }

  async createIncident(input: IncidentInput): Promise<IncidentRef> {
    const existing = await this.findByCorrelationId(input.correlation_id);
    if (existing) return existing;

    const body = {
      correlation_id: input.correlation_id,
      correlation_display: "sn-triage",
      short_description: (input.needs_review ? "[Needs review] " : "") + input.short_description,
      description: input.description,
      category: input.category,
      impact: String(input.impact),
      urgency: String(input.urgency),
      contact_type: input.contact_type ?? "self-service",
      work_notes: input.work_notes,
    };
    const q = new URLSearchParams({ sysparm_fields: "sys_id,number" });
    const data = await this.request<{ result: SnRecord }>("POST", `/api/now/table/incident?${q}`, body);
    return { sys_id: data.result.sys_id, number: data.result.number, url: this.incidentUrl(data.result.sys_id), replayed: false };
  }

  async ping() {
    const started = Date.now();
    try {
      await this.request<unknown>("GET", "/api/now/table/incident?sysparm_limit=1&sysparm_fields=sys_id");
      return { ok: true, detail: "incident table reachable", latency_ms: Date.now() - started };
    } catch (err) {
      const detail = err instanceof ServiceNowError ? `${err.code}${err.status ? ` (${err.status})` : ""}` : String(err);
      return { ok: false, detail, latency_ms: Date.now() - started };
    }
  }

  /** One HTTP call with timeout, classified errors, and retry on transient failures only. */
  private async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    let lastErr: ServiceNowError | undefined;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
      try {
        const res = await fetch(this.base + path, {
          method,
          headers: { Authorization: this.auth, Accept: "application/json", "Content-Type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
          signal: ctrl.signal,
        });
        if (res.ok) return (await res.json()) as T;
        const text = await res.text().catch(() => "");
        if (res.status === 401 || res.status === 403) throw new ServiceNowError("auth", `ServiceNow rejected credentials (${res.status})`, res.status);
        if (res.status === 429) lastErr = new ServiceNowError("rate_limited", "ServiceNow rate limited the request", 429);
        else if (res.status >= 500) lastErr = new ServiceNowError("unavailable", `ServiceNow returned ${res.status}`, res.status);
        else throw new ServiceNowError("bad_request", `ServiceNow returned ${res.status}: ${text.slice(0, 200)}`, res.status);
      } catch (err) {
        if (err instanceof ServiceNowError) {
          if (err.code === "auth" || err.code === "bad_request") throw err;
          lastErr = err;
        } else if (err instanceof Error && err.name === "AbortError") {
          lastErr = new ServiceNowError("timeout", `ServiceNow did not answer within ${this.timeoutMs}ms`);
        } else {
          lastErr = new ServiceNowError("unavailable", err instanceof Error ? err.message : String(err));
        }
      } finally {
        clearTimeout(timer);
      }
      if (attempt < this.maxAttempts) {
        const backoff = 300 * 2 ** (attempt - 1) + Math.random() * 200;
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
    throw lastErr ?? new ServiceNowError("unexpected", "request failed without an error");
  }
}

/* -------------------------------- factory --------------------------------- */

let singleton: IncidentClient | undefined;

export function getIncidentClient(): IncidentClient {
  if (singleton) return singleton;
  const url = process.env.SERVICENOW_INSTANCE_URL;
  const user = process.env.SERVICENOW_USERNAME;
  const pass = process.env.SERVICENOW_PASSWORD;
  singleton = url && user && pass ? new ServiceNowIncidentClient({ instanceUrl: url, username: user, password: pass }) : new MockIncidentClient();
  return singleton;
}
