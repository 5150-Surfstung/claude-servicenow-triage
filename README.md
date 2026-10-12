# Maintenance intake triage: Claude + ServiceNow

A tenant sends a free-text maintenance request. Claude turns it into a structured work order. A deterministic gate decides whether it routes itself or waits for a person. ServiceNow gets the incident either way, exactly once.

Built by Mike Olson ([Surfstung Systems](https://surfstung.com)) as a working demonstration of forward-deployed AI engineering on the Anthropic stack: structured outputs, prompt caching, a code-owned confidence gate, human-in-the-loop routing, idempotent enterprise integration, guardrails against prompt injection, and an eval harness that gates autopilot.

## What it shows

| Concern | How it's handled |
| --- | --- |
| Reliable structure | Claude gets exactly one tool, whose input schema is generated from the same Zod schema the server validates with. No invented fields; a missing tool call fails open to a person. |
| Cost | The system prompt carries a `cache_control` breakpoint; repeat calls read the stable prefix from cache. Token usage and cache hits are shown per request. |
| Judgment stays in code | `gate.ts` is pure code. Auto-route only when confidence clears the threshold, the category is known, and no guardrail fired. |
| Prompt injection | The tenant message is wrapped as data, scanned for instruction-like text, and the model reports its own `injection_suspected` flag. Either forces human review. The only tool is the structured output, so injected text has nothing to drive. |
| Draft reply safety | The tenant reply is scanned for money, legal language, links, phone numbers, and repair-date promises before anyone sees it. |
| Exactly once | Incidents are keyed by ServiceNow `correlation_id`. Replaying the same message returns the existing incident. Transient errors retry with backoff; auth errors do not. |
| Fail open to a person | If the model is unavailable, the incident is still created, flagged for human triage. The AI step never blocks intake. |
| Evals as a release gate | 26 golden cases. Below a 95% pass rate the system stays in draft mode. Eval runs never write to ServiceNow. |
| Observability | One JSON log line per request with request id, route, confidence, tokens, cache hit, stage timings, and incident number. `/api/health` exposes RED metrics. |

## Run it

```bash
cp .env.example .env.local      # add ANTHROPIC_API_KEY; ServiceNow is optional
npm install
npm run dev                      # http://localhost:3000
npm test                         # 28 unit tests, no network
npm run eval                     # golden set from the command line (exit 1 below the bar)
npm run eval -- --smoke          # same, exit 0 regardless (CI with the fake model)
```

Without `ANTHROPIC_API_KEY` the app runs a labeled keyword model so the pipeline, gate, idempotency and UI can be exercised. Its eval score (about 69%) is the baseline Claude is measured against, not a result.

Without `SERVICENOW_*` the app uses an in-memory mock incident store with the same idempotency contract.

## Connect a ServiceNow instance

1. Get a free Personal Developer Instance at https://developer.servicenow.com (sign in, then **Request Instance**).
2. Copy the instance URL and admin password it shows you.
3. Put them in `.env.local`:
   ```
   SERVICENOW_INSTANCE_URL=https://dev12345.service-now.com
   SERVICENOW_USERNAME=admin
   SERVICENOW_PASSWORD=...
   ```
4. `curl localhost:3000/api/health?deep=1` should report `servicenow.ok: true`.

Incidents land in the standard `incident` table with `impact`/`urgency` set from the triage priority, the maintenance category in `category`, the AI reasoning and draft reply in `work_notes`, and `[Needs review]` prefixed on anything the gate held. PDIs hibernate after a few idle days; wake it from the developer portal before a demo.

## Deploy

Vercel, zero config. Set the environment variables above in the project settings, plus `DEMO_ACCESS_CODE` so a public link can't spend your model budget. Route handlers declare `maxDuration` (30s triage, 60s eval run).

## Layout

```
src/lib/schema.ts        taxonomy, Zod schema, JSON Schema for the tool, ServiceNow priority matrix
src/lib/claude.ts        Anthropic client, system prompt with cache breakpoint, forced tool call
src/lib/fake-triager.ts  labeled keyword model for offline runs and tests
src/lib/guardrails.ts    input scan and reply scan
src/lib/gate.ts          routing decision, pure code
src/lib/servicenow.ts    Table API client with retry + idempotency, and the mock
src/lib/pipeline.ts      one request end to end, structured log line
src/lib/evals/           golden set and runner
src/app/api/             triage, evals/run, health
src/app/                 console, evals dashboard, how-it-works
```

## Three-minute walkthrough (Loom script)

1. **The problem (20s).** "Maintenance requests arrive as texts and emails. Someone reads each one, picks a category and priority, creates a ticket, and replies. It's slow, inconsistent, and the urgent ones wait behind the routine ones."
2. **Live run (60s).** Pick "Ceiling leak, active". Run. Point at the verdict: routed automatically, priority 1, emergency flag, the reasons the gate gives. Open the ServiceNow incident. Point at the work notes: reasoning and draft reply are on the record.
3. **Where it says no (40s).** Pick "Prompt injection". Run. "The message tries to close its own ticket. The scanner caught it, the model flagged it, the gate held it. The incident still exists, so nothing is lost; it's just waiting for a person."
4. **Evals (40s).** Open Evals. Run. "Twenty-six cases a property manager would sign off on. This number is the release gate. Under 95%, it stays in draft mode. Every correction a reviewer makes goes back into this set."
5. **What changes for a client (20s).** "Webhook into a queue instead of a sync call. OAuth instead of Basic. Their taxonomy and assignment groups through config. Same gate, same evals, their observability stack."
