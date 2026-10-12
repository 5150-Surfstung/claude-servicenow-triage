import { timingSafeEqual } from "node:crypto";

/**
 * Two cheap protections for a public demo:
 *  1. an optional shared access code (DEMO_ACCESS_CODE) sent as the x-demo-code header
 *  2. a per-IP token bucket so one visitor cannot drain the model budget
 * Production replaces both with SSO at the edge and a real gateway.
 */

const BUCKET_CAPACITY = Number(process.env.TRIAGE_RATE_LIMIT_PER_MIN ?? 20);
const REFILL_PER_MS = BUCKET_CAPACITY / 60_000;
const buckets = new Map<string, { tokens: number; updated: number }>();

export type AccessResult = { ok: true } | { ok: false; status: 401 | 429; code: "access_code_required" | "access_code_invalid" | "rate_limited" };

export function checkAccess(req: Request): AccessResult {
  const required = process.env.DEMO_ACCESS_CODE;
  if (required) {
    const given = req.headers.get("x-demo-code") ?? "";
    if (!given) return { ok: false, status: 401, code: "access_code_required" };
    const a = Buffer.from(given);
    const b = Buffer.from(required);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, status: 401, code: "access_code_invalid" };
  }

  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const now = Date.now();
  const bucket = buckets.get(ip) ?? { tokens: BUCKET_CAPACITY, updated: now };
  bucket.tokens = Math.min(BUCKET_CAPACITY, bucket.tokens + (now - bucket.updated) * REFILL_PER_MS);
  bucket.updated = now;
  if (bucket.tokens < 1) {
    buckets.set(ip, bucket);
    return { ok: false, status: 429, code: "rate_limited" };
  }
  bucket.tokens -= 1;
  buckets.set(ip, bucket);
  return { ok: true };
}
