import { afterEach, describe, expect, it, vi } from "vitest";
import { MockIncidentClient, ServiceNowError, ServiceNowIncidentClient, type IncidentInput } from "../servicenow";

const input: IncidentInput = {
  correlation_id: "sn-triage:abc",
  short_description: "2B: water through ceiling",
  description: "Water pouring through bathroom ceiling.",
  category: "plumbing",
  impact: 1,
  urgency: 1,
  work_notes: "AI triage",
  needs_review: false,
};

describe("MockIncidentClient", () => {
  it("creates once and replays on the same correlation id", async () => {
    const c = new MockIncidentClient();
    const a = await c.createIncident(input);
    const b = await c.createIncident(input);
    expect(a.replayed).toBe(false);
    expect(b.replayed).toBe(true);
    expect(b.number).toBe(a.number);
    expect(c.all()).toHaveLength(1);
  });
});

describe("ServiceNowIncidentClient", () => {
  afterEach(() => vi.unstubAllGlobals());

  function json(status: number, body: unknown) {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }

  it("looks up by correlation id before creating, and prefixes needs-review titles", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        if (init?.method === "GET") return json(200, { result: [] });
        return json(201, { result: { sys_id: "deadbeef", number: "INC0012345" } });
      })
    );
    const c = new ServiceNowIncidentClient({ instanceUrl: "https://dev1.service-now.com/", username: "admin", password: "pw", maxAttempts: 1 });
    const ref = await c.createIncident({ ...input, needs_review: true });
    expect(ref.number).toBe("INC0012345");
    expect(ref.replayed).toBe(false);
    expect(calls[0].url).toContain("sysparm_query=correlation_id%3Dsn-triage%3Aabc");
    const body = JSON.parse(String(calls[1].init?.body));
    expect(body.short_description).toBe("[Needs review] 2B: water through ceiling");
    expect(body.impact).toBe("1");
    expect(String(calls[1].init?.headers && (calls[1].init.headers as Record<string, string>).Authorization)).toMatch(/^Basic /);
  });

  it("returns the existing incident on replay without POSTing", async () => {
    const fetchMock = vi.fn(async () => json(200, { result: [{ sys_id: "x1", number: "INC0000001" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const c = new ServiceNowIncidentClient({ instanceUrl: "https://dev1.service-now.com", username: "a", password: "b" });
    const ref = await c.createIncident(input);
    expect(ref.replayed).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on 503 then succeeds", async () => {
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => (n++ === 0 ? new Response("down", { status: 503 }) : json(200, { result: [] })))
    );
    const c = new ServiceNowIncidentClient({ instanceUrl: "https://dev1.service-now.com", username: "a", password: "b", maxAttempts: 3 });
    const hit = await c.findByCorrelationId("sn-triage:abc");
    expect(hit).toBeNull();
    expect(n).toBe(2);
  });

  it("does not retry on 401", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const c = new ServiceNowIncidentClient({ instanceUrl: "https://dev1.service-now.com", username: "a", password: "b", maxAttempts: 3 });
    await expect(c.findByCorrelationId("x")).rejects.toMatchObject({ code: "auth" } satisfies Partial<ServiceNowError>);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
