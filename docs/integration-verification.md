# Integration verification — 14 October 2026

This is the historical integration milestone record. The subsequent explicit-provider changes and actual Groq test results are documented in [Groq verification](groq-verification.md) and [mode configuration](groq-mode.md).

## Final result

- Integration branch: `codex/ryde-integration`.
- Backend baseline branch: `baseline/codebuddy`, commit `89d21a20f11b81cbd0eee4a6dd30e8854f6417d0`.
- Original frontend: clean at `cfd8a83bc63162914c8359092e59112a5d205972`, unchanged.
- Protected backend source matches the baseline: all API handlers, `src/lib`, Prisma schema/seed, original home/layout/styles and authoritative API contract.
- Approved brand asset remains byte-for-byte identical to the original frontend asset.

## Commands and results

| Command | Final result |
| --- | --- |
| `npm install` | Completed; lockfile retained. Backend Next 14.2.18 was patched to compatible 14.2.35 with matching lint configuration. |
| `npm run db:generate` | Passed; Prisma Client 5.22 generated. No schema push, seed or reset ran. |
| `npm run typecheck` | Passed. |
| `npm run lint` | Passed with no ESLint warnings/errors. |
| `npm test` | **133 passed, 2 skipped**, across 11 files. Includes 8 new frontend-to-backend integration tests. |
| `npm run test:frontend` | **4 passed**; preserved standalone frontend fixture tests. |
| `npm run build` | Passed with Next 14.2.35; `/workspace` and dynamic case/mutation APIs built successfully. |
| `node scripts/qa-server.mjs` | Production server started at loopback port 3101 using a disposable SQLite copy and existing mock provider. |
| HTTP readiness | `/workspace` returned **200**. |

Initial concurrent Node checks hit the host memory limit. Final checks ran sequentially with a bounded Node heap; Next builds use one worker. The legacy Vite CJS notice appears during Vitest startup and does not affect results. No real-provider credentials were copied or used. The two real-provider smoke tests remain skipped.

## Integration-test coverage

The frontend typed transport and Zod response validators call the actual production route handlers against an isolated Prisma database copy. Tests cover:

1. Case discovery/detail and versioned policies.
2. Deterministic evaluation with no fabricated agent findings.
3. Initial mock investigation yielding INSUFFICIENT_EVIDENCE with approval unavailable.
4. Explicit geotag submission, preserved versions and stale snapshot detection.
5. Reinvestigation yielding REFUND_FULL / 500 cents with valid evidence references and preserved recommendation history.
6. Explicit human approval, persisted status/audit and rejection of duplicate decisions.
7. UI stale-snapshot guards, reinvestigation and explicit rejection.
8. Unknown cases, invalid evidence, contract mismatch and network failure without fixture fallback or automatic POST retries.

Logical refGroup citations from the canonical orchestrator are resolved through the associated recommendation's frozen evidence snapshot. Raw backend citations remain unchanged and visible. Trip references open actual trip metadata; policy references open the versioned policies.

## Production-browser verification

The browser exercised the built application through real HTTP requests, with **mock agents clearly labeled** and all writes routed to a disposable database copy:

- Initial case had four evidence groups and no recommendations.
- Explicit initial investigation produced INSUFFICIENT_EVIDENCE; approval remained disabled.
- Geotag preview showed the exact existing backend synthetic payload; a separate submit click persisted it.
- Approval remained disabled while the previous recommendation's snapshot was stale.
- Explicit reinvestigation produced REFUND_FULL for S$5.00 with PENDING human approval.
- Resolutions displayed the initial and revised recommendations, the newly included geotag, citations and audit events explaining the change.
- The geotag citation opened its actual database ID, payload, version, hash and backend integrity result.
- Human approval required a confirmation form and reviewer reason. After confirmation, the operations row showed Approved; a full page reload retained that decision.
- A later deterministic-only evaluation did not reuse previous agent findings. All three cards correctly showed no agent findings for the new recommendation.
- Explicit rejection persisted REJECTED status.
- At 390 px, rider and driver screens had no document horizontal overflow. Statement updates were visibly disabled and explained.
- Invalid GPS evidence produced the real backend validation error and no fake success. Valid structured GPS evidence persisted and displayed confirmation.
- No console warnings or errors occurred during the normal investigation/approval flow. The deliberate invalid-evidence request returned the expected HTTP 400.

Viewport screenshots are saved as ignored local QA artifacts:

- `qa/integration-resolution-desktop.jpg`
- `qa/integration-driver-mobile.jpg`

## Database preservation

The original WorkBuddy database was opened read-only solely to create the integration snapshot. No original database reset, seed, schema push, statement mutation or approval operation ran.

After automated tests and the browser workflow, a read-only check of the **application** `prisma/dev.db` confirmed:

- RT-001 status: **OPEN**.
- Recommendations: **0**.
- THIRD_PARTY_GEOTAG records: **0**.

Automated tests use fresh ignored copies through `tests/setup-isolated.ts`; browser QA uses another ignored copy through the process preload in `scripts/qa-database.mjs`. The latter can resume a named QA copy without resetting it. No database is committed.

## Remaining limitations

No live LLM execution, authentication, role enforcement, real file upload or real monetary settlement is verified. Statement/dispute creation, standalone reopening and manual escalation have no documented endpoints and are not simulated as successful API operations.

The existing approval handler does not enforce evidence-version/supersession/integrity constraints transactionally. The frontend adds a fresh-case check and disables stale approvals, but a backend race remains possible between that check and the write. Backend authorization and transactional version-bound approval are required before production use. The contract returns latest evidence payloads only, so historical payload previews are explicitly unavailable when necessary.

No original branch was merged, no unrelated histories were merged, and nothing was pushed.
