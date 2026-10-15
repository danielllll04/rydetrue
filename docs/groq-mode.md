# Explicit mock and Groq modes

The integration workspace loads Next.js environment files independently of the original projects. Local credentials belong only in its ignored `.env.local`. Keys are used server-side as authentication headers and are never passed to the UI, saved in audit events, or included in verification reports.

## Selection and isolation

- `RYDETRUE_LLM_MODE=mock`, or an absent mode, selects the existing mock provider even when a local API key is present.
- `RYDETRUE_LLM_MODE=groq` explicitly selects Groq. Failures escalate through the existing backend; they never substitute mock findings.
- Other mode values fail closed without a provider request.
- `dev:demo`, `start:demo` and the isolated mock QA launcher force mock mode before Next loads dotenv files. `VITEST` and the presence of a key cannot override this selection.
- `dev:groq` and `start:groq` use Next's environment loader, validate configuration before starting, force Groq mode, and always create a new disposable database under ignored `qa/`. They never reset or modify `prisma/dev.db` or an original project.

The required local variables are `RYDETRUE_LLM_API_KEY` (configure privately), `RYDETRUE_LLM_BASE_URL` with value `https://api.groq.com/openai/v1`, and `RYDETRUE_LLM_MODEL` with value `openai/gpt-oss-120b`. Restart the server after local configuration changes. No credentials are supplied in this document.

## Run and verify

Build once:

```powershell
npm run build
```

For an isolated mock demo, run `node scripts/qa-server.mjs` and open http://127.0.0.1:3101/workspace. In a second terminal, run `node --import tsx scripts/verify-groq.mjs --mock` against a fresh QA copy.

For real-provider browser testing:

```powershell
npm run start:groq
```

Open http://127.0.0.1:3102/workspace. Starting the server performs no inference or approval. Explicit investigation actions send the synthetic case data to Groq. Each new launch starts from a fresh disposable copy; no existing database is deleted or reset. Development mode is available through `npm run dev:groq`; do not run development and production servers concurrently from the same `.next` directory.

To verify the full HTTP flow against a fresh real-mode server, run `npm run verify:groq` in another terminal. It investigates RT-001, submits the existing synthetic Stage 2 geotag, and reinvestigates. It checks the three persisted agent findings, their schemas and evidence IDs, deterministic outcomes, evidence integrity, preserved history and pending human approval. It never submits an approval or rejection.

Verification reports and HTTP provenance stay under ignored `qa/`. The trace records only response metadata, counts and fixed error classifications; never authentication headers, request/response text, reasoning, or keys. The verifier exits unsuccessfully unless all three agents produce validated cited findings in both stages and actual Groq completions are observed. A successful HTTP request alone is insufficient.

## Groq transport compatibility

For cases within the existing tool budget, the application independently prefetches each advocate's full evidence using the unchanged allowlisted tools. The Groq adapter transports these actual reads as a completed native function exchange with matching tool IDs, then requests strict JSON output with citations constrained to returned evidence IDs. Larger cases retain the original model tool loop. The backend independently validates schemas, agent roles and citations. Neutral receives its existing evidence/context and has no evidence tools. See [measured optimization and successful recovery](groq-optimization.md).

Groq requests use low reasoning effort and bounded token output. The adapter consumes only structured answer content or native function arguments and ignores separate reasoning fields. Transient retries remain bounded at two. Full-precision Retry-After and token-reset headers schedule waits; cooldowns over 90 seconds explicitly defer without sending an early retry. A specifically classified upstream `json_validate_failed` generation error is retried once with identical input; other HTTP 400 errors and backend-invalid findings are not retried. A process-local queue serializes Groq requests across investigations. Rate limits, empty outputs, malformed calls and invalid findings remain explicit failures or escalations. Policy, sufficiency, evidence validation and human approval code are unchanged.

The investigation UI allows four minutes for a response, because the local Groq quota is 8,000 tokens per minute and bounded retries can exceed the former two-minute timeout. No policy or human approval gate is changed by this timeout adjustment.

The strict output format follows the [Groq structured-output documentation](https://console.groq.com/docs/structured-outputs). Actual provider errors remain possible and are reported; schema guarantees are not treated as evidence that a live call succeeded.

The legacy opt-in smoke tests are not a substitute for `verify:groq`: they can accept escalated outcomes. Actual milestone results are recorded in `groq-verification.md`.
