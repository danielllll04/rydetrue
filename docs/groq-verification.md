# Real Groq verification — 15 October 2026

This document preserves the earlier baseline result. The later [free-tier optimization and recovery verification](groq-optimization.md) completed both stages with genuine findings after honoring a daily-quota cooldown and recovering only the failed Neutral agent.

## Final production result

The initial production investigation **passed** with all three genuine Groq roles completed and persisted. Each role cited four valid evidence IDs. The outcome remained INSUFFICIENT_EVIDENCE / 0 cents / NOT_APPLICABLE.

The geotag reinvestigation **did not pass the full agent verification**: Rider Advocate and Driver Advocate completed, each with four valid cited IDs, but Neutral Resolution exhausted its bounded retries with HTTP 429. The investigation was explicitly ESCALATED and no neutral finding from the first run was reused. Deterministic sufficiency still produced REFUND_FULL / 500 cents / PENDING. A separate read-only check confirmed two preserved recommendations, valid recommendation citations, evidence integrity and zero approval/rejection events.

| Stage        | Rider                        | Driver                       | Neutral                      | Deterministic result                           |
| ------------ | ---------------------------- | ---------------------------- | ---------------------------- | ---------------------------------------------- |
| Initial      | COMPLETED, 4 valid citations | COMPLETED, 4 valid citations | COMPLETED, 4 valid citations | INSUFFICIENT_EVIDENCE, no approvable refund    |
| After geotag | COMPLETED, 4 valid citations | COMPLETED, 4 valid citations | ESCALATED, HTTP 429          | REFUND_FULL, 500 cents, human approval PENDING |

The final production trace observed **29 real Groq HTTP attempts: 13 successful completions and 16 rate-limit responses**. Successful completions identified `openai/gpt-oss-120b` and carried actual provider completion IDs. No mock provider was substituted. The verifier correctly exited with failure because the second Neutral Resolution did not complete.

Local sanitized evidence: `qa/groq-verification-1791997706679.json`, `qa/groq-trace-1791997695297.jsonl`, and `qa/mock-verification-1791997469410.json`.

The unified UI supports controlled real-provider browser testing and displays actual persisted role status, citations, provider provenance and escalation. **The current configuration has not achieved a clean production two-stage verification pass.** Groq quota availability remains a material limit. Check the Groq console's model quota or allow quota recovery before another fresh verification run; repeated HTTP 429 responses do not indicate a missing key. No quota reset time or account tier was inferred.

## Scope

Changes are confined to the `ryde-integration` repository on `codex/ryde-integration`. Explicit mock/real selection, provider transport compatibility, isolated launchers, a longer frontend investigation timeout, verification scripts and documentation were added. No original project, original database, deterministic policy/sufficiency logic, evidence validation, agent execution/orchestration, evidence tool execution, output validator, approval handler or Prisma schema was changed.

## Regression and isolation checks

- Offline suite: **147 passed, 2 skipped**. The two legacy opt-in smoke tests remain skipped; real HTTP verification is separate and does not use Vitest fixtures.
- Production build: passed, including lint and TypeScript validation.
- Final production mock HTTP flow: both stages passed, all six findings persisted and **zero Groq requests** were observed even with local `.env.local` credentials present.
- In-memory security check: the configured credential was absent from all 83 repository files examined and from public client bundles. No environment files, databases, QA artifacts, build artifacts or installed dependencies were staged or tracked.
- Protected backend file diff: empty. Original frontend working tree: clean.
- Every verification run uses a new database copy under ignored `qa/`. Application database hashes were unchanged before and after verification. No approval or rejection is submitted by the real verifier.

## Failures observed during development

Actual Groq requests initially returned HTTP 400 JSON-generation/native-tool errors. The integration adapter's text-only request mapping did not correctly carry a native tool conversation. Native evidence batching with matching tool IDs now feeds the existing validated backend tool loop, and advocate final answers use strict JSON schema output constrained to retrieved evidence IDs.

Other observed failures were empty answer content, a fabricated evidence citation rejected by the original backend validator, and HTTP 429 responses under the local **8,000-token-per-minute** quota. Requests within an investigation are now serialized. Network/rate-limit retries retain their existing bounds; only a specifically classified upstream JSON-generation rejection receives one additional generation attempt. Ordinary HTTP 400 errors and backend-invalid findings are not retried.

A development run produced all three genuine cited findings in both stages and six persisted findings, but its second HTTP response exceeded the frontend's former two-minute timeout. The server completed with REFUND_FULL / 500 cents / PENDING. This was recorded as a verifier failure, not silently treated as an end-to-end pass. The frontend investigation timeout was increased to four minutes before final production verification.

A later production attempt still encountered a JSON-generation rejection from Groq. The bounded, Groq-only generation retry was added and covered by focused regression tests before the final production rerun.

## Advisory quality observation

One earlier genuine Rider Advocate finding overstated entrance precision despite GPS accuracy of ±80 m. A valid citation identifies an existing record; it does not prove that every interpretation is correct. The Neutral Resolution explained the location uncertainty, and the deterministic initial result remained INSUFFICIENT_EVIDENCE with no approvable refund. Human review of advisory language remains necessary.

## Configuration and reproducibility

See [explicit mode configuration and commands](groq-mode.md). Production real mode starts with `npm run start:groq` at http://127.0.0.1:3102/workspace and always creates a fresh disposable database. `npm run verify:groq` performs the actual two-stage API investigation on that fresh copy. No inference or approval happens on server startup.

The local trace stores only HTTP metadata and fixed classifications, not credentials, prompts, answer text or reasoning. Sanitized JSON reports and trace files remain in ignored `qa/`; no key was displayed or committed.
