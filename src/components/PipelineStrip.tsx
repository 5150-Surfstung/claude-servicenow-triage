"use client";

/**
 * Five nodes on a line. While a request is in flight the nodes light up in sequence;
 * once a trace exists each node shows its real outcome. It is a picture of the actual
 * pipeline, not decoration: the order is the order the code runs in.
 */

export type StageState = "idle" | "running" | "done" | "warn" | "fail";

export interface StripStage {
  key: string;
  label: string;
  state: StageState;
  note?: string;
}

const COLORS: Record<StageState, { ring: string; fill: string; text: string }> = {
  idle: { ring: "stroke-cream/25", fill: "fill-navy-deep", text: "text-cream/40" },
  running: { ring: "stroke-gold", fill: "fill-navy-deep", text: "text-gold" },
  done: { ring: "stroke-gold", fill: "fill-gold", text: "text-cream" },
  warn: { ring: "stroke-clay", fill: "fill-clay", text: "text-cream" },
  fail: { ring: "stroke-clay", fill: "fill-navy-deep", text: "text-clay" },
};

export function PipelineStrip({ stages }: { stages: StripStage[] }) {
  const n = stages.length;
  return (
    <div className="w-full" role="img" aria-label={stages.map((s) => `${s.label}: ${s.state}`).join(", ")}>
      <svg viewBox={`0 0 ${n * 120} 28`} className="w-full h-7" preserveAspectRatio="none" aria-hidden>
        <line x1="60" y1="14" x2={n * 120 - 60} y2="14" className="stroke-cream/20" strokeWidth="2" />
        {stages.map((s, i) => {
          const c = COLORS[s.state];
          const cx = 60 + i * 120;
          const prevDone = i > 0 && (stages[i - 1].state === "done" || stages[i - 1].state === "warn");
          return (
            <g key={s.key}>
              {i > 0 && prevDone && <line x1={cx - 120} y1="14" x2={cx} y2="14" className="stroke-gold" strokeWidth="2" />}
              <circle cx={cx} cy="14" r="9" className={`${c.fill} ${c.ring}`} strokeWidth="2.5" />
              {s.state === "running" && (
                <circle cx={cx} cy="14" r="9" className="fill-none stroke-gold" strokeWidth="2.5" style={{ animation: "pulse-ring 1.1s ease-out infinite" }} />
              )}
              {s.state === "done" && <path d={`M ${cx - 4} 14 l 3 3 l 6 -6`} className="stroke-navy-deep" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
              {s.state === "warn" && <path d={`M ${cx} 9.5 v 5.5 M ${cx} 18 v 0.5`} className="stroke-cream" strokeWidth="2.2" strokeLinecap="round" fill="none" />}
              {s.state === "fail" && <path d={`M ${cx - 3.5} 10.5 l 7 7 M ${cx + 3.5} 10.5 l -7 7`} className="stroke-clay" strokeWidth="2.2" strokeLinecap="round" />}
            </g>
          );
        })}
      </svg>
      <div className="grid text-center" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {stages.map((s) => (
          <div key={s.key} className={`text-[11px] sm:text-xs leading-tight ${COLORS[s.state].text}`}>
            <div className="font-medium">{s.label}</div>
            {s.note && <div className="text-cream/50 truncate px-1">{s.note}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
