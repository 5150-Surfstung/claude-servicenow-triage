import type { Triage, Category, Priority } from "./schema";
import type { Triager, TriageOutcome, TriageRequest } from "./claude";

/**
 * Deterministic keyword triager. Used when ANTHROPIC_API_KEY is absent and in unit tests
 * so the pipeline, gate, idempotency, and UI can be exercised without the model.
 * It is labeled "fake" everywhere it appears. Its eval scores say nothing about Claude.
 */
export class FakeTriager implements Triager {
  readonly source = "fake" as const;
  readonly model = "fake-keyword-v1";

  async triage(req: TriageRequest): Promise<TriageOutcome> {
    const started = Date.now();
    const t = req.text.toLowerCase();
    const has = (...words: string[]) => words.some((w) => t.includes(w));

    const injection = /ignore (all |the )?(previous|prior|above) instructions|you are now|system prompt|mark (this|it) (as )?resolved|create \d+ (tickets|incidents)/i.test(req.text);
    const es = /\b(no hay|agua|fuga|calefacci|aire|luz|cerradura|cucarach|ratas|ba[ñn]o|inodoro|gotea)\b/i.test(req.text);

    let category: Category = "other";
    if (has("gas", "smoke", "fire", "carbon monoxide", "co alarm", "sparking", "burning smell", "exposed wire", "mold", "humo", "fuego")) category = "safety";
    else if (has("leak", "flood", "water", "drain", "toilet", "faucet", "clog", "hot water", "sewage", "agua", "fuga", "inodoro", "gotea")) category = "plumbing";
    else if (has("outlet", "breaker", "power", "lights", "light ", "electric", "luz")) category = "electrical";
    else if (has("heat", "ac ", "a/c", "air condition", "thermostat", "furnace", "cooling", "calefacci", "aire")) category = "hvac";
    else if (has("fridge", "refrigerator", "stove", "oven", "dishwasher", "washer", "dryer", "microwave", "disposal")) category = "appliance";
    else if (has("roach", "mice", "mouse", "rat", "bug", "ant ", "ants", "termite", "bed bug", "cucarach", "ratas")) category = "pest";
    else if (has("lock", "key", "fob", "locked out", "garage door", "gate", "cerradura")) category = "access";
    else if (has("ceiling", "roof", "wall", "window", "floor", "door frame", "balcony", "crack")) category = "structural";
    else if (has("noise", "loud", "neighbor", "party", "music")) category = "noise";
    else if (has("trash", "garbage", "dumpster", "hallway", "clean")) category = "cleaning";

    let priority: Priority = 3;
    if (category === "safety" || has("flood", "pouring", "gushing", "sewage", "locked out", "no heat") || (category === "plumbing" && has("ceiling"))) priority = 1;
    else if (has("no hot water", "no water", "not cooling", "won't turn on", "not working", "ongoing", "still", "no hay")) priority = 2;
    else if (has("paint", "cosmetic", "squeak", "caulk", "scuff", "chip")) priority = 4;
    if (category === "noise" || category === "cleaning") priority = Math.max(priority, 3) as Priority;

    const words = req.text.trim().split(/\s+/).length;
    let confidence = category === "other" ? 0.4 : 0.88;
    if (words < 4) confidence = Math.min(confidence, 0.55);
    if (/\band\b.*\balso\b|\balso\b/i.test(req.text) && words > 12) confidence = Math.min(confidence, 0.72);
    if (injection) confidence = Math.min(confidence, 0.5);

    const unit = req.unit ? `${req.unit}: ` : "";
    const summary = `${unit}${category === "other" ? "maintenance request" : category} issue reported`.slice(0, 160);
    const window = priority === 1 ? "right away" : priority === 2 ? "within 24 hours" : priority === 3 ? "within 3 business days" : "on the next scheduled visit";
    const tenant_reply = es
      ? `Recibimos su solicitud. Un técnico responderá ${priority === 1 ? "de inmediato" : priority === 2 ? "dentro de 24 horas" : "en los próximos días"}.`
      : `We received your request and a technician will respond ${window}.${priority === 1 && category === "plumbing" ? " If water is still flowing, shut the valve under the sink or behind the toilet." : ""}`;

    const triage: Triage = {
      category,
      priority,
      confidence,
      summary,
      details: req.text.slice(0, 2000),
      tenant_reply,
      emergency: priority === 1,
      injection_suspected: injection,
      language: es ? "es" : "en",
      needs_info: category === "plumbing" && !has("active", "still", "stopped") ? ["Is the leak still active?"] : [],
      reasoning: `Keyword match on ${category}; priority ${priority} from severity words. (fake model)`,
    };
    return {
      ok: true,
      triage,
      model: this.model,
      usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      latency_ms: Date.now() - started,
      source: this.source,
    };
  }
}
