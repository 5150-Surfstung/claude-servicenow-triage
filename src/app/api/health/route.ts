import { NextResponse } from "next/server";
import { getTriager } from "@/lib/pipeline";
import { getIncidentClient } from "@/lib/servicenow";
import { thresholdFromEnv } from "@/lib/gate";
import { metricsSnapshot } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const deep = url.searchParams.get("deep") === "1";
  const triager = getTriager();
  const incidents = getIncidentClient();
  const servicenow = deep ? await incidents.ping() : { ok: true, detail: "not probed (add ?deep=1)", latency_ms: 0 };
  return NextResponse.json({
    ok: servicenow.ok,
    triager: { source: triager.source, model: triager.model },
    servicenow: { mode: incidents.mode, ...servicenow },
    threshold: thresholdFromEnv(),
    access_code_required: Boolean(process.env.DEMO_ACCESS_CODE),
    metrics: metricsSnapshot(),
  });
}
