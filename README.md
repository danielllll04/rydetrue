# RydeTRUE

> **Evidence-led dispute resolution — Milestone 1 (deterministic core)**
>
> Submission to the **Tencent Cloud AI CAN DO IT Hackathon Singapore 2026**, under Ryde's *Multi-Agent Autonomous Dispute Resolution System* challenge.
>
> Tagline: **Two sides. One fair resolution.**

This milestone establishes the **deterministic foundation** of RydeTRUE: data model, evidence retrieval, GPS verification, policy evaluation, and APIs. AI agents and the full dashboard are intentionally deferred to subsequent milestones.

All trip records and policies in this repository are **synthetic**. No production Ryde services are contacted and no real refunds are processed.

## Stack

- Next.js 14 (App Router) + TypeScript (strict)
- Tailwind CSS
- Prisma + SQLite
- Zod
- Vitest

## Quickstart

```bash
npm install
npm run db:reset    # creates SQLite DB, runs schema, seeds RT-001
npm test            # runs all Vitest tests
npm run dev         # http://localhost:3000
```

## Synthetic case — RT-001

| Field | Value |
|---|---|
| City | Singapore |
| Category | Cancellation fee |
| Disagreement | Where the pickup happened |
| Rider claim | "I was at the pickup pin." |
| Driver claim | "Rider wasn't there; I was at the lobby next door." |
| Resolution | **REFUND_FULL** (SGD 5.00 returned) |

The dispute resolves in favour of the rider because:

1. The rider's GPS trail ends ~2 m from the pickup pin.
2. The driver's GPS trail ends ~96 m from the pickup pin (a different curb).
3. The synthetic cancellation-fee policy v2 (`SG-CXL-R1`) refunds the fee whenever the rider is within 50 m of the pickup pin **and** the driver is farther than 50 m.

## API

| Route | Description |
|---|---|
| `GET /api/cases` | List all disputes |
| `GET /api/cases/RT-001` | Full case detail with statements, evidence (grouped + latest), hash integrity, and audit log |
| `POST /api/cases/RT-001/evaluate` | Run policy against the case; persist recommendation + audit event |
| `GET /api/policies` | List all policy versions |

Example evaluation request:

```bash
curl -X POST http://localhost:3000/api/cases/RT-001/evaluate \
  -H "content-type: application/json" \
  -d '{"policyCode":"CANCELLATION_FEE_SG","actor":"system:demo"}'
```

## Architecture (M1)

```
src/lib/
  geo.ts        - Haversine, bearing
  evidence.ts   - canonical JSON, SHA-256 hash, retrieval + versioning
  policy.ts     - deterministic policy evaluator (pure function)
  schemas.ts    - Zod schemas (evidence payloads, evaluate request)
  cases.ts      - synthetic RT-001 fixtures
  db.ts         - Prisma client

src/app/api/
  cases/...                 - REST API
src/app/page.tsx            - minimal landing page (logo text + links)

prisma/
  schema.prisma             - Trip, Dispute, Statement, Evidence,
                              AgentFinding, PolicyVersion,
                              Recommendation, AuditEvent
  seed.ts                   - seeds RT-001 + policy versions

tests/                      - Vitest suites (geo, evidence, policy,
                              schemas, api)
```

## Limitations of M1

- **No AI agents yet** — `AgentFinding` is scaffolded for M2.
- **No dashboard UI** — only a minimal landing page linking to JSON APIs.
- **Synthetic data only** — RT-001 uses fictional statements, GPS pings and policy rules.
- **Single-policy variant per dispute at evaluation** — multi-policy consensus arrives later.
- **No appeals flow** — `AuditEvent` records actions but the appeal state machine is not yet implemented.
- **No authentication** — `actor` field is trusted-as-claimed (placeholder).
- **Single jurisdiction** — Singapore cancellation-fee policy only. Other categories (overcharge, no-show, etc.) follow the same pattern in M2.

## Next milestones (preview)

- **M2** — Investigator / Auditor / Recommender agents wired in via the `AgentFinding` model.
- **M3** — Operator dashboard (case queue, evidence inspector, audit timeline).
- **M4** — Appeals and reviewer overrides.
- **M5** — Multi-policy evaluation with confidence-weighted consensus.

## Branding

The RydeTRUE logo and tagline are approved and provided separately. The repository contains only textual references to the brand (`rydeTRUE`) and the Ryde pink palette in `tailwind.config.ts`; no logo files are bundled here. Do not redesign or reproduce the logo.