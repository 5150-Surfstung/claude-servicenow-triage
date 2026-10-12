/**
 * The pipeline as a picture. Boxes are the actual modules in src/lib; arrows are the actual call order.
 * Gold = the auto path, clay = the human path, dashed = what happens when the model is down.
 */
export function ArchitectureDiagram() {
  const box = "fill-navy stroke-cream/30";
  const label = "fill-cream text-[13px] font-medium";
  const sub = "fill-cream/60 text-[11px]";
  return (
    <figure className="console rounded-lg p-4 sm:p-6">
      <svg viewBox="0 0 1000 345" className="w-full h-auto" role="img" aria-labelledby="arch-title arch-desc">
        <title id="arch-title">Pipeline architecture</title>
        <desc id="arch-desc">
          A tenant message passes an intake scan, then Claude produces one structured tool call, then the draft reply is scanned,
          then a code-owned gate routes either to an auto-routed ServiceNow incident or to a needs-review incident. A model outage
          goes straight to needs review. The golden eval set gates whether autopilot is allowed.
        </desc>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-cream/60" />
          </marker>
          <marker id="arrow-gold" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-gold" />
          </marker>
          <marker id="arrow-clay" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-clay" />
          </marker>
        </defs>

        {/* Main line */}
        <g>
          <rect x="10" y="56" width="150" height="70" rx="6" className="fill-cream/10 stroke-cream/30" />
          <text x="85" y="86" textAnchor="middle" className={label}>Tenant message</text>
          <text x="85" y="106" textAnchor="middle" className={sub}>sms, email, web form</text>
        </g>
        <line x1="160" y1="91" x2="188" y2="91" className="stroke-cream/60" strokeWidth="1.5" markerEnd="url(#arrow)" />

        <g>
          <rect x="190" y="56" width="150" height="70" rx="6" className={box} />
          <text x="265" y="86" textAnchor="middle" className={label}>Intake scan</text>
          <text x="265" y="106" textAnchor="middle" className={sub}>length cap, injection scan</text>
        </g>
        <line x1="340" y1="91" x2="368" y2="91" className="stroke-cream/60" strokeWidth="1.5" markerEnd="url(#arrow)" />

        <g>
          <rect x="370" y="50" width="170" height="82" rx="6" className="fill-navy stroke-gold" strokeWidth="1.5" />
          <text x="455" y="76" textAnchor="middle" className={label}>Claude</text>
          <text x="455" y="95" textAnchor="middle" className="fill-gold text-[11px]">submit_triage(…)</text>
          <text x="455" y="113" textAnchor="middle" className={sub}>single tool call, cached prefix</text>
        </g>
        <line x1="540" y1="91" x2="568" y2="91" className="stroke-cream/60" strokeWidth="1.5" markerEnd="url(#arrow)" />

        <g>
          <rect x="570" y="56" width="150" height="70" rx="6" className={box} />
          <text x="645" y="86" textAnchor="middle" className={label}>Reply guardrails</text>
          <text x="645" y="106" textAnchor="middle" className={sub}>money, legal, links, dates</text>
        </g>
        <line x1="720" y1="91" x2="738" y2="91" className="stroke-cream/60" strokeWidth="1.5" markerEnd="url(#arrow)" />

        <g>
          <rect x="740" y="50" width="170" height="82" rx="6" className="fill-navy stroke-cream" strokeWidth="1.5" />
          <text x="825" y="76" textAnchor="middle" className={label}>Gate</text>
          <text x="825" y="95" textAnchor="middle" className={sub}>pure code, no model</text>
          <text x="825" y="113" textAnchor="middle" className={sub}>conf ≥ 0.80, category known</text>
        </g>

        {/* Gate outputs */}
        <path d="M 790 132 C 790 175, 600 160, 600 198" className="stroke-gold fill-none" strokeWidth="2" markerEnd="url(#arrow-gold)" />
        <path d="M 862 132 C 862 160, 850 160, 850 198" className="stroke-clay fill-none" strokeWidth="2" markerEnd="url(#arrow-clay)" />
        <text x="672" y="165" className="fill-gold text-[11px]">auto</text>
        <text x="872" y="168" className="fill-clay-soft text-[11px]">human</text>

        <g>
          <rect x="480" y="200" width="240" height="56" rx="6" className="fill-gold" />
          <text x="600" y="223" textAnchor="middle" className="fill-navy-deep text-[13px] font-medium">ServiceNow incident, routed</text>
          <text x="600" y="242" textAnchor="middle" className="fill-navy-deep/80 text-[11px]">categorized, prioritized, reply ready</text>
        </g>
        <g>
          <rect x="740" y="200" width="245" height="56" rx="6" className="fill-clay" />
          <text x="862" y="223" textAnchor="middle" className="fill-cream text-[13px] font-medium">ServiceNow incident, needs review</text>
          <text x="862" y="242" textAnchor="middle" className="fill-cream/85 text-[11px]">unassigned, reasons in work notes</text>
        </g>

        {/* Model down: dashed path straight to needs review */}
        <path d="M 455 132 L 455 292 L 850 292 L 850 258" className="stroke-clay fill-none" strokeWidth="1.5" strokeDasharray="5 5" markerEnd="url(#arrow-clay)" />
        <text x="465" y="284" className="fill-clay-soft text-[11px]">model unavailable: intake still lands, flagged for a person</text>

        {/* Idempotency note */}
        <text x="500" y="330" className={sub}>one incident per message, keyed by correlation_id; a replay returns the existing one</text>

        {/* Evals feeding the gate */}
        <g>
          <rect x="10" y="200" width="300" height="56" rx="6" className="fill-cream/10 stroke-cream/30" strokeDasharray="4 3" />
          <text x="160" y="223" textAnchor="middle" className={label}>Golden set, 26 cases</text>
          <text x="160" y="242" textAnchor="middle" className={sub}>under 95% keeps the gate in draft mode</text>
        </g>
        <path d="M 310 228 C 450 228, 600 110, 738 100" className="stroke-cream/40 fill-none" strokeWidth="1.5" strokeDasharray="4 3" markerEnd="url(#arrow)" />
      </svg>
      <figcaption className="mt-3 text-xs text-cream/60">
        Boxes are the modules in <span className="font-mono">src/lib</span>; arrows are the order the code runs in.
      </figcaption>
    </figure>
  );
}
