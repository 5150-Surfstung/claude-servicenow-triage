"use client";

import { useEffect, useState } from "react";

type Health = {
  triager: { source: "claude" | "fake"; model: string };
  servicenow: { mode: "mock" | "live" };
};

export function ModeChip() {
  const [h, setH] = useState<Health | null>(null);
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setH)
      .catch(() => setH(null));
  }, []);
  if (!h) return <span className="text-xs text-cream/60">checking mode</span>;
  const model = h.triager.source === "fake" ? "fake model" : h.triager.model;
  const sn = h.servicenow.mode === "live" ? "ServiceNow live" : "ServiceNow mock";
  const warn = h.triager.source === "fake" || h.servicenow.mode === "mock";
  return (
    <span
      className={`text-xs whitespace-nowrap rounded-full px-3 py-1 border ${warn ? "border-gold/70 text-gold" : "border-cream/40 text-cream"}`}
      title={warn ? "Set ANTHROPIC_API_KEY and SERVICENOW_* to run live" : "Live"}
    >
      {model}, {sn}
    </span>
  );
}
