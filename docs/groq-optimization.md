# Groq free-tier workflow optimization — 15 October 2026

## Measurement before optimization

The saved real production trace `qa/groq-trace-1791997695297.jsonl` and its disposable database were examined read-only before behavior changes. The trace has SHA-256 `e2d1bc71dfcf4dfd3cd47f2148498ae08a09eaafb3c560e8d8b241e45c90973c`. Per-agent attribution below was reconstructed from the inspected serialized R,D,R,D,R,D,N request sequence and the two completed audit records; the old trace did not label roles directly. New metrics label investigation and agent explicitly.

| Stage | Agent | HTTP attempts | Completions | 429s | Reported input tokens | Reported output tokens | Mean HTTP response ms | Agent elapsed ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | Rider | 4 | 3 | 1 | 6,366 | 1,036 | 929 | 19,956 |
| 1 | Driver | 4 | 3 | 1 | 6,345 | 961 | 1,371 | 50,270 |
| 1 | Neutral | 3 | 1 | 2 | 3,641 | 1,106 | 983 | 33,974 |
| 2 | Rider | 9 | 3 | 6 | 6,622 | 1,008 | 504 | 73,228 |
| 2 | Driver | 6 | 3 | 3 | 6,601 | 934 | 788 | 104,378 |
| 2 | Neutral | 3 | 0 | 3 | unavailable | unavailable | 95 | unavailable |

Totals: **29 HTTP attempts, 13 completions, 16 HTTP 429 responses, 29,575 reported input tokens and 5,045 reported output tokens**. Stage elapsed times were **84.307 seconds** and **135.778 seconds**. Agent elapsed times overlap because the advocates execute independently while their provider requests queue. Total measured HTTP response time was only 21.696 seconds, compared with 220.085 seconds across both stages; quota/backoff waits dominated.

Usage is reported only for successful responses. The historical trace contains no usage on rejected requests and no cached-token accounting; these are not estimates of charged quota or billing. A failed Neutral request must not be described as consuming zero tokens.

The bottleneck was repeated evidence-planning inference, repeated prompt context, and retries sent before the server's full cooldown. The old code parsed fractional Retry-After values with parseInt and capped waits at 30 seconds. Retrying a failed stage also reran already-completed advocates.

## Implemented changes

- Groq alone enables application evidence prefetch. Each independent advocate executes the same allowlisted, case-scoped evidence tools before inference. The RT-001 stages require seven and eight actual tool reads respectively, within the unchanged eight-call limit. All evidence groups, statements and trip data are supplied. Cases exceeding this prefetch budget retain the original tool loop rather than losing evidence.
- Prefetch is a deterministic application read plan, not an AI finding. Its actual tool results are transported as a completed native tool exchange. Only the final advisory finding requires inference, reducing the planned fresh workflow from seven to **three model requests per stage**: Rider, Driver and Neutral. Findings remain separate model outputs; advocates never receive each other's findings.
- JSON sections in the neutral context are compacted without removing any field or changing string values. Upstream inference explicitly uses `cache: no-store`; only explicit validated finding reuse can avoid a new inference request.
- Retry-After supports fractional seconds and HTTP dates. A server cooldown is never shortened to the local wait bound. At most two transient retries are allowed; a cooldown exceeding 90 seconds defers with RATE_LIMIT_DEFERRED rather than sending an early request. Missing Groq Retry-After falls back to the token-reset header or bounded exponential backoff with jitter. The existing one additional retry for a classified JSON-generation rejection remains bounded.
- A shared process-local Groq queue serializes transport across investigations. Remaining-token/reset headers schedule conservative pre-request waits, using an estimated request size plus the output budget. This estimate only schedules waiting; it never truncates evidence or overrides validation.
- Duplicate same-case investigations receive HTTP 409 while one is running in that process. Other applications or server processes can still consume organization-wide quota; local scheduling cannot guarantee their behavior.
- `retryInvestigationId` explicitly requests recovery from the latest ESCALATED investigation. Completed advocates are reused only after checking the current unapproved recommendation, complete input fingerprint, model/workflow identity, evidence integrity and IDs, statements, trip, policy/version/effective window, prompts/tool definitions, original completed status, finding schema/role/party, nonempty citations and stored finding hashes. Changed, stale, corrupted, cross-case or actioned sources are rejected before inference.
- The policy and sufficiency engines rerun independently. Reused genuine outputs receive new provenance pointing to the source investigation; immutable history is retained. Neutral always runs against the verified current inputs. The UI offers **Retry failed agents** and labels reused findings; ordinary reinvestigation remains available for a fresh run.
- Mock selection and execution remain isolated from Groq, prefetch and quota logic. Credentials never select real mode. No original project, policy/evidence validator, approval handler or database schema was changed.

## Instrumentation and reproducibility

The Groq launcher creates a fresh disposable database and an empty `qa/groq-metrics-TIMESTAMP.jsonl` for each run. Metrics contain only investigation/agent identifiers, logical request IDs, attempts, HTTP status, response latency, quota wait, reported token usage and explicitly allowlisted numeric quota metadata/classifications. No authentication headers, credentials, prompts, answers, reasoning or raw upstream errors are stored.

Build with `npm run build`, then start with `npm run start:groq`. Port can be overridden with `PORT`. The verifier accepts the loopback-only `RYDETRUE_VERIFY_ORIGIN` when an existing preview occupies the default port. Run `npm run verify:groq -- --retry-failed-once` for a fresh two-stage test with at most one explicit recovery per failed stage; RATE_LIMIT_DEFERRED stops recovery. Plain `npm run verify:groq` does not request stage recovery. Both modes report direct per-agent measurements and leave approvals pending.

The first optimized live trial was stopped after two JSON-generation rejections from Groq when actual tool results were supplied as plain user context. No validated finding was claimed. Native tool-result formatting was restored while retaining the application read plan and one-call advocate inference. A regression test covers the matching tool IDs, exact tool-result content, strict output mode and no-store request.

Groq documents organization-wide RPM/RPD/TPM/TPD limits and the meaning of its quota/reset headers in the [official rate-limit documentation](https://console.groq.com/docs/rate-limits). No billing or model/provider changes were made.

## Controlled production results

The corrected native-prefetch run used disposable `qa/groq-run-1792000495482.db`. Stage 1 completed all three genuine Groq findings, each with four valid citations. Stage 2 completed both advocates, each with five valid citations, then Neutral received a **TPD (tokens per day) HTTP 429**. The response still showed 8,000 remaining TPM tokens, identifying daily quota as the immediate limiting factor. Retry-After was **268 seconds**, above the 90-second in-request wait bound. The application correctly deferred without sending an early retry; the fresh verifier exited with failure and retained the two completed findings.

After the advertised cooldown had elapsed, one explicit API recovery reused the two validated, unchanged Stage 2 advocate findings. Neutral made one new real Groq request and completed. Recovery took **3.799 seconds**. All three final roles had five valid citations. The deterministic result remained **REFUND_FULL / 500 cents / PENDING**; no human approval or rejection was submitted.

| Stage / attempt | Agent | HTTP attempts | 429s | Reported input tokens | Reported output tokens | HTTP response ms | Quota wait ms | Agent elapsed ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | Rider | 1 | 0 | 3,100 | 1,138 | 4,869 | 0 | 4,876 |
| 1 | Driver | 1 | 0 | 3,093 | 1,055 | 3,317 | 26,642 | 34,834 |
| 1 | Neutral | 1 | 0 | 3,355 | 1,105 | 3,106 | 31,836 | 34,946 |
| 2 / fresh | Rider | 1 | 0 | 3,464 | 1,038 | 2,675 | 28,455 | 31,133 |
| 2 / fresh | Driver | 1 | 0 | 3,457 | 928 | 2,432 | 31,197 | 64,763 |
| 2 / fresh | Neutral | 1 | 1 | unavailable | unavailable | 101 | 36,188 | 36,296 |
| 2 / recovery | Rider | 0 | 0 | no new inference | no new inference | — | — | reused |
| 2 / recovery | Driver | 0 | 0 | no new inference | no new inference | — | — | reused |
| 2 / recovery | Neutral | 1 | 0 | 3,612 | 1,199 | 3,652 | 0 | fresh |

Stage 1 elapsed 69.926 seconds. The first Stage 2 attempt elapsed 101.169 seconds; recovery elapsed 3.799 seconds, **plus the separate daily-quota cooldown**. Queue waits can overlap advocate elapsed times. This does not establish a faster overall wall-clock two-stage run under daily limits.

| Recorded outcome | Before | Optimized run including recovery |
| --- | ---: | ---: |
| HTTP attempts | 29 | 7 |
| Successful model completions | 13 | 6 |
| HTTP 429 responses | 16 | 1 |
| Reported input tokens | 29,575 | 20,081 |
| Reported output tokens | 5,045 | 6,463 |
| Final Stage 2 agents | Neutral failed | All completed after cooldown and recovery |

Reported input tokens fell **32.1%** and HTTP attempts fell **75.9%** against the recorded baseline. These are observations from two runs with different quota availability, not a guaranteed benchmark or billed-token comparison. The optimized responses reported 768 cached prompt tokens; five successful responses omitted cached-token details. Daily quota remains shared with other applications and cannot be eliminated by local scheduling.

Sanitized local reports:

- `qa/groq-verification-1792000508364.json`: fresh attempt, correctly unsuccessful after daily-quota deferral.
- `qa/groq-recovery-verification-1792001022758.json`: successful integrated API recovery; matching advocate finding hashes, zero new advocate requests, one successful Neutral request, valid citations, preserved three-recommendation history, no approval/rejection events and unchanged application database.
- `qa/groq-metrics-1792000495482.jsonl`: direct per-agent HTTP measurements for both attempts.
- `qa/groq-optimization-comparison.json`: aggregated before/after measurements.

## Validation and browser readiness

The full backend suite passed **166 tests**, with **2 legacy opt-in live smoke tests skipped**. Live API verification above was run separately. The standalone frontend suite passed **4 tests**. Production build, lint and type checks passed. Production mock verification passed both stages with **zero Groq requests**, using its own disposable database.

The unified UI was inspected against the recovered production case: all three roles show Completed, both advocates show “Reused validated finding · unchanged inputs”, citations open the persisted hash-verified geotag, provider is Groq, and the S$5.00 recommendation remains human approval PENDING. The current optimized preview is `http://127.0.0.1:3103/workspace`; the isolated mock preview is `http://127.0.0.1:3104/workspace`. These are local running-process previews, not deployments.

The UI is ready for controlled real-provider browser testing, subject to available Groq quota. A fresh uninterrupted two-stage run was **not** demonstrated: the validated final completion required respecting a daily-quota deferral and explicitly recovering Stage 2. Original projects and application database remain unchanged. Protected policy logic, sufficiency/evidence validation, citation schemas, tool allowlists, approval handler and database schema have no changes. A private in-memory credential scan found no configured key in repository files or the public client build; environment, QA, database and build files remain ignored and excluded from version control.
