import { NextResponse } from "next/server";
import { z } from "zod";
import { runTriage } from "@/lib/pipeline";
import { checkAccess } from "@/lib/access";
import { MAX_INPUT_CHARS } from "@/lib/guardrails";

export const runtime = "nodejs";
export const maxDuration = 30;

const Body = z.object({
  text: z.string().max(MAX_INPUT_CHARS + 1000),
  unit: z.string().max(32).optional(),
  channel: z.enum(["sms", "email", "web", "phone"]).optional(),
  idempotency_key: z.string().max(128).optional(),
});

export async function POST(req: Request) {
  const access = checkAccess(req);
  if (!access.ok) return NextResponse.json({ error: access.code }, { status: access.status });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body", detail: parsed.error.issues }, { status: 400 });

  const result = await runTriage(parsed.data);
  if (!result.ok) return NextResponse.json(result.body, { status: result.status });
  return NextResponse.json(result.trace, { status: 200 });
}
