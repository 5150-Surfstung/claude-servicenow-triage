import { describe, expect, it } from "vitest";
import { decideRoute } from "../gate";
import type { Triage } from "../schema";

const base: Triage = {
  category: "plumbing",
  priority: 2,
  confidence: 0.92,
  summary: "4F: no hot water",
  details: "No hot water since yesterday morning.",
  tenant_reply: "We received your request and a technician will respond within 24 hours.",
  emergency: false,
  injection_suspected: false,
  language: "en",
  needs_info: [],
  reasoning: "Clear plumbing issue, urgent but contained.",
};

describe("decideRoute", () => {
  it("auto-routes a confident, clean triage", () => {
    const d = decideRoute({ triage: base, injectionHeuristic: false, replyViolations: [], threshold: 0.8 });
    expect(d.route).toBe("auto");
    expect(d.emergency).toBe(false);
  });

  it("sends low confidence to a person", () => {
    const d = decideRoute({ triage: { ...base, confidence: 0.61 }, injectionHeuristic: false, replyViolations: [], threshold: 0.8 });
    expect(d.route).toBe("human");
    expect(d.reasons[0]).toMatch(/confidence 0\.61 below 0\.80/);
  });

  it("sends category=other to a person even at high confidence", () => {
    const d = decideRoute({ triage: { ...base, category: "other", confidence: 0.95 }, injectionHeuristic: false, replyViolations: [], threshold: 0.8 });
    expect(d.route).toBe("human");
  });

  it("sends injection (heuristic or model flag) to a person", () => {
    expect(decideRoute({ triage: base, injectionHeuristic: true, replyViolations: [], threshold: 0.8 }).route).toBe("human");
    expect(decideRoute({ triage: { ...base, injection_suspected: true }, injectionHeuristic: false, replyViolations: [], threshold: 0.8 }).route).toBe("human");
  });

  it("sends reply guardrail hits to a person", () => {
    const d = decideRoute({ triage: base, injectionHeuristic: false, replyViolations: ["reply promises money or credit"], threshold: 0.8 });
    expect(d.route).toBe("human");
    expect(d.reasons.join(" ")).toContain("promises money");
  });

  it("keeps emergencies on auto when confident, and flags them", () => {
    const d = decideRoute({ triage: { ...base, priority: 1, emergency: true, confidence: 0.97 }, injectionHeuristic: false, replyViolations: [], threshold: 0.8 });
    expect(d.route).toBe("auto");
    expect(d.emergency).toBe(true);
    expect(d.reasons.at(-1)).toMatch(/emergency/);
  });

  it("fails open to a person when the model produced nothing", () => {
    const d = decideRoute({ triage: null, triageError: "llm_unavailable", injectionHeuristic: false, replyViolations: [], threshold: 0.8 });
    expect(d.route).toBe("human");
    expect(d.reasons[0]).toMatch(/model unavailable/);
    expect(d.confidence).toBeNull();
  });
});
