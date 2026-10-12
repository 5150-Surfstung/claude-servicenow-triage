import { ArchitectureDiagram } from "@/components/ArchitectureDiagram";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "How it works" };

export default function HowItWorks() {
  return (
    <article>
      <div className="max-w-prose">
        <h1 className="text-4xl sm:text-5xl font-semibold leading-[1.05]">The model proposes. Code decides.</h1>
        <p className="mt-4 text-ink-soft">
          Every place a wrong answer could cost money or trust has a deterministic check in front of it. Here is the whole
          thing, then what each piece is for, then what changes for a production client.
        </p>
      </div>

      <div className="mt-8">
        <ArchitectureDiagram />
      </div>

      <div className="max-w-prose">
      <h2 className="mt-10 text-2xl font-semibold">The pipeline</h2>
      <ol className="mt-4 space-y-4 list-decimal pl-6">
        <li>
          <strong>Intake checks.</strong> Length cap and a pattern scan for instruction-like text. The message is treated as data from here
          on; nothing in it can call a tool.
        </li>
        <li>
          <strong>Claude, one tool.</strong> The only tool is <code className="font-mono">submit_triage</code>, whose input schema is generated
          from the same Zod schema the server validates against. The model cannot invent fields, and if it ever answers in prose instead of calling the tool, the request fails open to a person. The
          system prompt carries a cache breakpoint, so repeat calls read the stable prefix from cache.
        </li>
        <li>
          <strong>Reply guardrails.</strong> The drafted tenant reply is scanned for money, legal language, links, phone numbers, and
          repair-date promises. Any hit holds the reply as a draft.
        </li>
        <li>
          <strong>The gate.</strong> Pure code, no model. Auto-route only when confidence clears the threshold, the category is known,
          and no guardrail fired. Otherwise the incident is created unassigned with a needs-review flag. Emergencies are
          auto-routed and flagged for a phone call.
        </li>
        <li>
          <strong>ServiceNow.</strong> One incident per message, keyed by <code className="font-mono">correlation_id</code>. A replay returns the existing incident
          instead of creating a second one. Transient failures retry with backoff; auth failures do not.
        </li>
        <li>
          <strong>Fail open to a person.</strong> If the model is down, the incident is still created, marked for human triage. Intake is
          never blocked by the AI step.
        </li>
      </ol>

      <h2 className="mt-10 text-2xl font-semibold">What the evals are for</h2>
      <p className="mt-3">
        Twenty-six cases with answers a property manager would sign off on. The pass rate is the release gate: below 95%, the
        system stays in draft mode and a person approves every route. The set is small on purpose so a miss is readable, and it
        grows every time a reviewer corrects the model, which is how the threshold earns its way up.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">What changes for a production client</h2>
      <ul className="mt-4 space-y-3 list-disc pl-6">
        <li>Intake becomes a webhook into a queue with an idempotent worker, not a synchronous request. The gate logic does not change.</li>
        <li>Basic auth becomes an OAuth client-credentials grant scoped to the incident table; the mock adapter stays for CI.</li>
        <li>
          Incident creation moves behind an outbox with a unique correlation key, which closes the small window where two identical
          requests could both pass the lookup.
        </li>
        <li>Categories map to the client&apos;s own taxonomy and assignment groups through configuration, not prompt edits.</li>
        <li>Every human correction is logged against the request and feeds the golden set; repeated corrections become a prompt or rule change.</li>
        <li>Traces ship to the client&apos;s observability stack as the same JSON lines this app already writes.</li>
      </ul>

      <h2 className="mt-10 text-2xl font-semibold">Run it yourself</h2>
      <pre className="mt-3 rounded-md bg-navy-deep text-cream text-sm p-4 font-mono overflow-auto">{`cp .env.example .env.local   # add ANTHROPIC_API_KEY and, optionally, SERVICENOW_*
npm install
npm run dev                   # http://localhost:3000
npm test                      # unit tests, no network
npm run eval                  # golden set from the command line`}</pre>
      </div>
    </article>
  );
}
