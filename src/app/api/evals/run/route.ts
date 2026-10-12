import { NextResponse } from "next/server";
import { runEvals } from "@/lib/evals/run";
import { GOLDEN } from "@/lib/evals/golden";
import { checkAccess } from "@/lib/access";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const access = checkAccess(req);
  if (!access.ok) return NextResponse.json({ error: access.code }, { status: access.status });

  let ids: string[] | undefined;
  try {
    const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
    if (Array.isArray(body.ids)) ids = body.ids.filter((x): x is string => typeof x === "string");
  } catch {
    /* no body is fine */
  }
  const cases = ids?.length ? GOLDEN.filter((c) => ids!.includes(c.id)) : GOLDEN;
  const report = await runEvals({ cases, concurrency: 4 });
  return NextResponse.json(report);
}

export async function GET() {
  return NextResponse.json({ cases: GOLDEN.map((c) => ({ id: c.id, tags: c.tags, text: c.text, unit: c.unit, expect: c.expect })) });
}
