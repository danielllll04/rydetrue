# RydeTRUE unified application

The canonical CodeBuddy backend and the approved frontend now run in one Next.js application. Everything is synthetic; all monetary actions are simulated.

## Isolated repository and recoverability

- Directory: `ryde-integration`, a new repository separate from both originals.
- Integration branch: `codex/ryde-integration`.
- Recoverable backend baseline: `baseline/codebuddy`, commit `89d21a20f11b81cbd0eee4a6dd30e8854f6417d0`.
- Frontend source: `feature/ryde-frontend`, commit `cfd8a83bc63162914c8359092e59112a5d205972`; original repository and commit unchanged.
- CodeBuddy's folder was not a Git repository. Its source, configuration and tests were copied into the new repository and committed before integration. No unrelated histories were merged.
- No credentials, environment files, node_modules, generated builds, databases or QA artifacts were copied into Git. `.workbuddy-ai` memory was excluded.
- A read-only SQLite backup created the ignored `prisma/dev.db` integration snapshot. Neither the original database nor this application snapshot is reset by tests or browser QA.

## Run

Requires Node.js 20.9+.

```powershell
npm install
npm run db:generate
npm run dev:demo
```

Open **http://127.0.0.1:3100/workspace**. The existing backend home page remains at `/`; none of its source was replaced. Production preview:

```powershell
npm run build
npm run start:demo
```

Provider selection now requires an explicit mode: `mock` is the default even with local credentials present; only `RYDETRUE_LLM_MODE=groq` selects real inference. Demo launchers force mock mode before dotenv loading. Real-mode launchers always use a disposable database and never silently substitute mock findings. See [mode configuration and launch commands](docs/groq-mode.md) and [actual live verification results](docs/groq-verification.md).

The subsequent [free-tier optimization and measured recovery results](docs/groq-optimization.md) document header-aware bounded waits, three fresh model requests per stage, validated recovery of completed advocate findings and the successfully recovered real two-stage investigation.

The existing local database snapshot is already populated with initial RT-001 data. Do not run `db:reset` or the original `db:seed` script on an existing database: the latter deletes and recreates RT-001. Both original scripts are preserved for recoverability, not invoked by the integration workflow. If the ignored local database is missing on a new checkout, restore an authorized snapshot; this project does not silently seed or reset data.

## Five connected experiences

- Investigation: trip and statements, current evidence groups/versions and integrity, persisted agent findings, advisory uncertainty, deterministic policy outcome, evidence citations, explicit investigation/reinvestigation, geotag submission, human decision and audit.
- Operations: hydrated persisted case detail, search, category/status filters, review queue and current recommendations. Review indicators are derived from statuses; no nonexistent priority field is invented.
- Rider: recorded rider statement and trip, current status and structured synthetic evidence submission through the evidence API.
- Driver: recorded driver statement, rider allegation, trip and structured synthetic evidence submission.
- Resolution: current recommendation and approval status, recommendation history, snapshot additions explaining a changed outcome, citations and immutable backend audit.

Hash links preserve screen and case selection (for example, `/workspace#resolution/RT-001`). Refresh retrieves persisted state. API errors never fall back to frontend fixtures.

## Demo walkthrough

1. Open RT-001 in Investigation; click **Run initial investigation**.
2. Inspect the persisted mock-agent findings and **INSUFFICIENT_EVIDENCE**. No policy rule is applied and no refund can be approved.
3. Click **Submit synthetic geotag**, review the existing backend Stage 2 payload, then explicitly click **Submit geotag evidence**. This adds a versioned `THIRD_PARTY_GEOTAG` record; it does not run an investigation.
4. Click **Run reinvestigation**. The backend evaluates sufficiency and fictional policy independently of the agents. The expected result is **REFUND_FULL, S$5.00**, with **PENDING** approval.
5. Open Resolutions to compare recommendation history and the newly included geotag snapshot. Evidence citations use actual database IDs.
6. Return to Investigation; select **Review & approve** or **Reject recommendation**. Enter a claimed reviewer identity and reason, then explicitly confirm. The UI re-reads the case before submitting the decision. Nothing is approved automatically.
7. Refresh or reload: the recommendation, status and audit remain persisted. No real money is moved.

Backend fixtures use **Door 1 / Door 2**, rather than the standalone frontend's Door 6 / Door 8. This integration displays backend truth. UTC timestamps are rendered in Asia/Singapore time, labeled SGT. Monetary values stay integer cents until display.

## Connected endpoints

The authoritative specification remains `docs/API_CONTRACT.md`, unchanged.

| Method / path                                          | Connected use                                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `GET /api/cases`                                       | Case discovery                                                                       |
| `GET /api/cases/{id}`                                  | Current detail, statements, findings, evidence versions/integrity, history and audit |
| `POST /api/cases/{id}/evidence`                        | Explicit structured evidence/geotag submission                                       |
| `POST /api/cases/{id}/evaluate`                        | Explicit deterministic evaluation without agents                                     |
| `POST /api/cases/{id}/investigate`                     | Explicit full investigation with configured provider                                 |
| `POST /api/cases/{id}/recommendations/{recId}/approve` | Explicit human approval or rejection                                                 |
| `GET /api/policies`                                    | Actual versioned policy display and selection                                        |

`src/frontend/lib/api-client.ts` provides typed transport, Zod response validation, timeouts and error mapping. Writes are never automatically retried. A successful write followed by a failed refresh is reported as recorded, rather than inviting duplicate submission. `api-types.ts` models the actual DTOs; `view-model.ts` joins findings to the current recommendation's investigation and rejects stale evidence snapshots for UI review.

Next 14 can cache static GET case lists. The workspace hydrates every returned case through the dynamic case-detail endpoint before displaying status/history, avoiding stale case-list recommendation counts. There is no case-creation endpoint to integrate. Latest evidence IDs are recovered by joining group/version to the integrity records; historical payloads are not mislabeled as latest versions.

## Preserved code and compatibility

- Deterministic policy/sufficiency, evidence validation, original prompts, tool execution, output validators, approval gates, Prisma schema/seed and original tests remain unchanged. The Groq milestones add explicit provider selection, transport and quota handling, evidence prefetch, validated stage recovery and the corresponding investigation API/UI support; see `docs/groq-optimization.md` for the verified scope.
- New frontend code lives under `src/frontend`; App Router entry lives under `src/app/workspace`.
- Original frontend components, fixtures and mock adapter are preserved in the new namespace, but the connected entry does not import the mock service or use fixture findings as API output.
- React 18, Tailwind 3, Prisma 5 and backend aliases remain canonical. The frontend's Tailwind 4 import was removed; original backend Tailwind directives remain in place.
- Next.js received a same-major patch from 14.2.18 to 14.2.35 after the installer flagged the old release. Lucide and matching lint tools were added. Configuration limits build concurrency to one worker and pins file tracing to this checkout.
- Approved brand asset is copied byte-for-byte, with the original CSS viewport treatment.

## Validation and database isolation

```powershell
npm run typecheck
npm run lint
npm test
npm run test:frontend
npm run build
```

The backend tests intentionally reset synthetic records. `tests/setup-isolated.ts` redirects the Prisma singleton to a fresh, ignored **disposable database copy** before any backend imports. Those test resets affect only that copy. Original backend tests are unchanged. The eight added integration tests exercise frontend HTTP serialization and runtime validation against production route handlers, including retrieval, initial investigation, evidence submission, reinvestigation, history, explicit approval/rejection, stale UI guards and failures. The four standalone frontend fixture tests are preserved separately.

For a production-build browser test without changing the application database:

```powershell
node scripts/qa-server.mjs
```

Open http://127.0.0.1:3101/workspace. This starts the built application with the existing mock provider and a new ignored database copy, using a process preload to supply the Prisma singleton. It does not modify backend database source or reset any existing database.

## Unsupported features and material limitations

- Statement creation/editing, dispute creation, actual file uploads and a standalone reopen action are disabled and explained. Structured evidence is supported. No fake success is displayed for absent endpoints.
- Manual escalation has no documented write endpoint. Provider failures and insufficient evidence still reach the backend-controlled human review queue.
- No authentication or role verification exists. The backend trusts `actor`; this is a local synthetic demonstration, not a production authorization boundary.
- The existing approval handler checks pending state but does **not** enforce supersession/evidence version or integrity at approval time. The UI adds fresh-case and snapshot checks, but cannot eliminate a race between checking and approving. Backend transactional/version-bound approval remains necessary before production.
- The current contract returns latest evidence payloads only. Historical citations show available version/integrity metadata and explicitly disclose when the old payload cannot be previewed.
- The case-list endpoint's recommendation count reflects its backend query; the workspace uses full recommendation history instead. No backend query was silently changed.
- Findings and uncertainty are advisory. No fabricated confidence percentages are displayed. Mock findings remain mock even though the API executes and persists them.
- The original integration milestone validated mock behavior. The later real-provider milestone has a separate actual-results record in `docs/groq-verification.md`. Authenticated approval and real financial settlement remain unsupported.
- New clones do not contain database files, secrets or installed packages. An authorized database snapshot is required.

The full verification record is in `docs/integration-verification.md`. No merge or push is performed.
