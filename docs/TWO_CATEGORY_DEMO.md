# Two-category prototype

Branch: `codex/rt002-fare-discrepancy`, based on committed integration baseline `7343554`.

## Launch (PowerShell, integration workspace)

```powershell
cd 'C:\Users\Daniel\OneDrive\文档\ChatGPT\Singapore Tencent Hackathon\ryde-integration'
npm run build
$env:PORT='3130'
npm run start:two-category:mock
```

Open `http://127.0.0.1:3130/workspace`. Choose RT-001 or RT-002 using **Active case** or **Overview**. Each launch creates a fresh disposable copy under ignored `qa/`, preserves its RT-001 records, and adds RT-002. It never seeds, resets or updates `prisma/dev.db` or the original projects.

For real Groq, in a separate terminal:

```powershell
$env:PORT='3131'
npm run start:two-category:groq
```

Open `http://127.0.0.1:3131/workspace`. Real mode requires the locally configured, ignored `.env.local`: `RYDETRUE_LLM_API_KEY` (never display or commit), `RYDETRUE_LLM_BASE_URL=https://api.groq.com/openai/v1`, and `RYDETRUE_LLM_MODEL=openai/gpt-oss-120b`. The launcher selects the mode explicitly. Mock mode does not select Groq even when credentials exist. A real provider failure remains visible; it never silently substitutes mock findings.

Use Ctrl+C in a server terminal to stop that demo. Start a new instance for a fresh presentation; previous disposable databases retain their history. The original single-category launch commands remain available.

## Judge flow

1. Select a case and run **Run initial investigation**. Inspect Rider Advocate, Driver Advocate and Neutral Resolution findings and evidence citations. Missing evidence prevents a supported monetary recommendation and human review.
2. RT-001: preview and submit the synthetic independent geotag. RT-002: preview and submit the synthetic pricing audit. Submission alone does not update the recommendation; the previous snapshot remains ineligible for review.
3. Run **Run reinvestigation**. Inspect the new findings, policy result and evidence snapshot.
4. Explicitly approve or reject an eligible current recommendation, entering a reviewer identity and reason. All monetary actions are simulated.
5. Open **Resolutions** to show the before/after recommendation snapshots, new evidence and recorded human decision. Raw evidence IDs, payloads, hashes and policy codes remain accessible in details.

RT-001 retains its existing cancellation-fee policy. RT-002 is fixed upfront fare reconciliation: accepted quote + verified permitted extras versus actual charged receipt, using integer cents. It does not infer driver fault or pricing authorization from GPS, distance or route length. The fixture's partial refund is computed; changing supported charge/authorization amounts changes the result. Fully permitted charges produce NO_REFUND. Missing or contradictory pricing evidence produces no unsupported refund.

## Validation and isolated automation

```powershell
npm test
npm run test:frontend
npm run typecheck
npm run lint
npm run build
```

With a **fresh** two-category mock server running, the following exercises both categories through HTTP, submits synthetic evidence, checks findings/citations and records simulated approvals in that disposable database:

```powershell
node --import tsx scripts/verify-two-categories.mjs
```

To check existing browser-completed records without writes:

```powershell
node --import tsx scripts/verify-two-categories.mjs --inspect
```

With a fresh real server, controlled RT-002 verification (six planned model completions, subject to retries/quota):

```powershell
node --import tsx scripts/verify-two-categories.mjs --groq --fare-only
```

Omit `--fare-only` to test both categories against Groq (twelve planned completions). This spends additional free-tier quota. Verification stops on failure and preserves records; it does not fabricate findings. Use the workspace's existing validated retry action for an eligible failed Groq run after the reported cooldown. Retry recovery revalidates snapshot, category, model, prompts, policy and completed findings.

The verifier first compares unique RT-002 evidence IDs with the configured disposable database before issuing any write. Sanitized QA reports, token/timing metrics, provider HTTP provenance, databases and screenshots stay under ignored `qa/`.

## Checkpoint C results

- 248 backend/presentation tests passed; 2 opt-in real-provider tests skipped.
- 4 frontend service tests passed; type checking, lint and production build passed.
- Browser: both categories completed both stages and explicit simulated approvals. Initial insufficient and stale-snapshot controls were disabled. Fare citation inspection exposed the actual payload/hash. The fare Resolution page had no horizontal document overflow at 1000px desktop width.
- Fresh HTTP verification: both categories, all twelve mock agent findings/citations, both approvals and audit histories passed; zero Groq HTTP requests.
- Application database and approved branding hashes matched the pre-change baseline. Credential scan found no configured key in repository files or public client assets.

## Checkpoint D: controlled real Groq result (15 October 2026)

**Stage 1 passed. Stage 2 did not pass; the full RT-002 live flow is not verified.** The integrated API used `openai/gpt-oss-120b` against a fresh disposable database. All three Stage 1 agents completed genuine inference with validated schemas and citations in about 53.9 seconds. The deterministic result was insufficient evidence with no refund approval available.

After the pricing audit, the Rider Advocate completed with valid citations. Driver Advocate requests repeatedly received upstream HTTP 400 `json_validate_failed` / application `OUTPUT_JSON_INVALID`. The first Stage 2 attempt safely escalated after about 119.1 seconds and skipped Neutral. Three explicit recovery attempts also failed at Driver. Each recovery preserved the genuine completed Rider finding unchanged; no mock output was substituted.

Integrated request totals across both stages and recovery:

| Agent              | HTTP requests | HTTP 200 | HTTP 400 | Known prompt tokens | Known completion tokens | HTTP response time total | Quota wait total |
| ------------------ | ------------: | -------: | -------: | ------------------: | ----------------------: | -----------------------: | ---------------: |
| Rider Advocate     |             3 |        2 |        1 |               5,826 |                   1,400 |                   6.99 s |          49.64 s |
| Driver Advocate    |             9 |        1 |        8 |               2,683 |                     449 |                  16.83 s |         169.34 s |
| Neutral Resolution |             1 |        1 |        0 |               2,379 |                     912 |                   2.57 s |          24.30 s |

There were **13 integrated requests: 4 HTTP 200 and 9 HTTP 400, with zero HTTP 429**. Groq reported an 8,000-token-per-minute limit; existing pacing waited up to about 30.5 seconds between requests. Known successful usage was 10,888 prompt + 2,761 completion tokens. Failed-response token usage was not supplied and is not counted as zero.

One separate bounded diagnostic request returned HTTP 200 from the requested model. It was not a completed integrated investigation, was not persisted as an agent finding, and is excluded from the validated-completion totals above. Metadata-only diagnostics of failing requests showed empty failed-generation content, so no specific malformed field could be identified. No provider error bodies or credentials were saved or printed. The precise upstream structured-output cause remains unresolved; no prompt, provider transport or validation was weakened to force a pass.

The final real database retains five recommendations (initial, failed Stage 2 and three recoveries), a PENDING computed 600-cent recommendation, all audit history and **zero human decision events**. Every persisted finding validated; recovered Rider finding hashes matched. `prisma/dev.db` remained unchanged.

The unified UI renders both categories, actual Groq findings and the live failure/recovery state correctly. Use the validated **explicit mock demo** for a dependable complete two-category presentation. RT-002's Driver structured-output failure is the remaining blocker to a dependable complete live fare demonstration. RT-001 was regression-tested through both stages in mock mode; it was not retested against Groq in this checkpoint.

Detailed sanitized artifacts remain ignored locally: `qa/rt002-live-final-results.json`, `qa/two-category-groq-verification-1792054427598.json`, and `qa/rt002-live-format-blocker.png`. The failed initial verifier exited nonzero as expected. The mock verifier continued to pass after the live attempts. Its history inspection now permits additional preserved retry recommendations and still requires a completed current investigation, valid citations and explicit approval.

## Prototype limits

Synthetic source labels and VERIFIED pricing records are fixtures, not authenticated external payment evidence. Reviewer identities are claimed, not authenticated. Money movement is simulated. RT-002 supports SGD fixed accepted quotes and explicit permitted extras only; metered/time/distance pricing, arbitrary route complaints, payment integrations and real evidence ingestion are outside scope.

Groq free-tier quotas and network availability can still delay the live demo. Preserve the explicitly labeled mock demo as the presentation fallback. Live verification results must be reported separately; a passing mock investigation is not evidence of successful real inference.
