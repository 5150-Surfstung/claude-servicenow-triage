export const MAX_INPUT_CHARS = 4000;

const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all |the |any |your |my |these )?(previous|prior|above|earlier) (instructions|rules|prompts?)/i,
  /\byou are now\b/i,
  /\bsystem prompt\b/i,
  /<\/?(system|assistant|instructions?)>/i,
  /\b(assistant|system)\s*:/i,
  /\bmark (this|it|the)( ticket| request| incident)? (as )?(resolved|closed|complete)/i,
  /\bcreate \d+ (tickets|incidents|work orders)/i,
  /\b(developer|debug|admin) mode\b/i,
  /\bpriority\s*(=|:)\s*1\b/i,
  /\bset (the )?(priority|category) to\b/i,
];

export interface InputCheck {
  ok: boolean;
  error?: "empty" | "too_long";
  injection_suspected: boolean;
}

/** Deterministic checks on the raw tenant message before it reaches the model. */
export function checkInput(text: string): InputCheck {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { ok: false, error: "empty", injection_suspected: false };
  if (trimmed.length > MAX_INPUT_CHARS) return { ok: false, error: "too_long", injection_suspected: false };
  const injection_suspected = INJECTION_PATTERNS.some((re) => re.test(trimmed));
  return { ok: true, injection_suspected };
}

const REPLY_RULES: Array<{ id: string; re: RegExp; why: string }> = [
  { id: "money", re: /\$\s?\d|\b(reimburse|reimbursement|refund|compensat\w*|rent credit|credit your|waive|discount)\b/i, why: "promises money or credit" },
  { id: "legal", re: /\b(lawyer|attorney|legal action|sue|lawsuit|liab\w+)\b/i, why: "legal language" },
  { id: "link", re: /https?:\/\/|www\./i, why: "contains a link" },
  { id: "phone", re: /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/, why: "contains a phone number" },
  { id: "date_promise", re: /\b(will be (fixed|repaired|replaced) (by|on)|guarantee)\b/i, why: "promises a repair date" },
];

export interface ReplyCheck {
  ok: boolean;
  violations: string[]; // rule ids
  reasons: string[];
}

/** Deterministic checks on the drafted tenant reply. Any hit forces human review; the reply is still shown as a draft. */
export function checkReply(reply: string): ReplyCheck {
  const violations: string[] = [];
  const reasons: string[] = [];
  for (const rule of REPLY_RULES) {
    if (rule.re.test(reply)) {
      violations.push(rule.id);
      reasons.push(`reply ${rule.why}`);
    }
  }
  return { ok: violations.length === 0, violations, reasons };
}
