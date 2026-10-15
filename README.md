# RydeTRUE

**Two sides. One fair resolution.** A synthetic two-category dispute-resolution prototype for the Tencent Cloud Hackathon, Singapore, 16 October 2026. Unofficial Ryde concept; no real customer data or money movement.

The public demo uses **MOCK (simulated) agent responses**. Evidence processing, citation validation, deterministic policy evaluation, review eligibility, persisted recommendations and audit history run through the actual application API and SQLite database. Mock inference is never presented as live inference.

## Run locally

Use Node.js 22, preferably its latest security patch (`.node-version` pins the deployment version). No API key, environment file or existing database is needed.

```sh
npm ci --include=dev
npx prisma generate
npm run build
npm run start:public
```

Open http://localhost:10000/ (redirects to `/workspace`). Optional PowerShell port override: `$env:PORT='3140'; npm run start:public`. The launcher binds `0.0.0.0`, respects the hosting `PORT`, forces public mock mode and blocks external server fetches.

Each visitor receives an opaque HttpOnly, SameSite cookie and a separate temporary SQLite database. Initialization uses tracked `prisma/demo-schema.sql` and synthetic TypeScript fixtures, never the ignored `prisma/dev.db`. Sessions expire 30 minutes after creation or on server restart/redeploy/hosting spin-down. Refresh starts a fresh session. **Start new demo** resets only the current visitor's two cases. Tabs sharing cookies share a session; use another browser/private window for independent visitors.

## Judge walkthrough: both categories

1. Select RT-001 or RT-002 and run the initial investigation. Missing independent evidence prevents a supported monetary decision. Inspect each agent's actual mock findings and evidence citations.
2. Submit the supplied independent evidence, then reinvestigate.
3. Compare persisted recommendation history, evidence snapshots and policy explanation.
4. Explicitly approve or reject the eligible current recommendation. Inspect the recorded human decision and audit history.

**RT-001: cancellation fee.** The initial pickup evidence is uncertain; Stage 2 adds a synthetic independent third-party pickup geotag. The cancellation policy evaluates the synthetic S$5.00 fee.

**RT-002: fare discrepancy.** The evaluator reconciles an accepted quote, actual charge and verified permitted extras using integer cents. A separate Stage 2 pricing audit resolves the initially missing authorization. For the provided fixture, S$29.00 charged minus S$20.00 accepted quote minus S$3.00 permitted extras computes S$6.00 excess. No-refund and insufficient/contradictory evidence paths are tested. Neither agents nor UI hardcode the refund or infer driver fault from route length.

Public evidence writes accept only the supplied Stage 2 fixtures, once per case/session. Arbitrary uploads or claims of verified platform/third-party evidence are rejected. All records and parties are fictional.

## Architecture and safety

Next.js 15 / React 19 UI and Node route handlers; Prisma 5 / SQLite. Rider Advocate and Driver Advocate investigate independently. Neutral Resolution explains the independently computed deterministic recommendation. Agent findings are advisory, schema validated and citation checked; they cannot change policy outcomes or authorize money movement.

Category-specific evidence sufficiency, conservative policy fallbacks, versioned canonical SHA-256 evidence hashes, recommendation snapshots/supersession and audit events are preserved. Human approval/rejection rechecks current pending recommendation, active policy and latest verified evidence atomically on the server. A request-scoped database context is mandatory in public mode; accidental access to the local database fails closed.

Public safeguards: 32 sessions; 12 session creations/minute and 60/hour globally (including reset); 8 active API requests globally; 120 requests/minute/session; 24 valid attempted mutations/session; 16 KiB write bodies; same-origin JSON writes; per-session case mutation locks. Rate/capacity errors include `Retry-After: 60`. These are prototype bounds, not comprehensive DDoS protection.

The original projects/databases remain untouched. Private developer launchers `start:two-category:mock` and `start:two-category:groq` remain available and copy a local snapshot into disposable QA storage. They are **not** public deployment entry points. Groq mode remains private and explicit. Rate-limit/recovery behavior is preserved; previous live RT-002 Stage 2 upstream JSON-validation failures are irrelevant to the fully labeled public mock flow. Do not configure Groq credentials on the host.

## Validate

```sh
npm test
npm run test:frontend
npm run lint
npm run typecheck
npm run build
npm audit
```

Regression tests initialize fresh disposable synthetic databases under ignored `qa/`, without resetting or requiring the original database. Opt-in real-inference tests are skipped by default. Public tests cover both full mock journeys, independent findings/citations, review gates, zero fetch calls, isolated state, reset/expiry, source restrictions, request/creation limits and concurrent mutations.

With the public production server running:

```sh
npm run verify:public
# Stop and restart npm run start:public, then:
node --import tsx scripts/verify-public.mjs --after-restart
```

For a different port on PowerShell, first set `$env:VERIFY_ORIGIN='http://127.0.0.1:3140'`. This HTTP verifier refuses non-loopback writes and uses two independent cookie sessions. Also validate both categories in independent browser sessions before submission.

## Deployment and limitations

Recommended: **one Render Free Node Web Service with ephemeral SQLite**, without a paid disk or database. See [DEPLOYMENT.md](DEPLOYMENT.md) for exact GitHub publication steps, hosting commands, environment variables, costs and acceptance checks. No public URL exists until publication/deployment is explicitly approved and completed.

This is a temporary synthetic prototype: no real refunds, authenticated reviewer identity, durable audit retention, production tenant identity or guaranteed uptime. Cookie loss or restart starts over. Capacity guards can temporarily reject legitimate visitors. HTTPS is required publicly. Run one Node process/instance; the session registry and locks are in memory and do not support horizontal scaling.

The patched dependency toolchain retains the approved palette/config and existing workspace CSS. Next-specific lint rules were replaced by explicit TypeScript parsing and React/hook rules to eliminate an unpatched vulnerable glob dependency; production Next type validation and full regression/build checks remain enabled. Local checks do not prove Linux host resources, account eligibility or live HTTPS readiness. Complete the public acceptance check after deployment before submitting the form.
