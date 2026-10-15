# Public demo readiness — 15 October 2026

Assessment: **locally validated and ready for owner-authorized publication/deployment**. No GitHub push, hosted deployment, billing activation or purchase has been performed. A public HTTPS acceptance check remains mandatory before submission.

Baseline preserved: `codex/rt002-fare-discrepancy` at `c0b90c69936390bf66a8633652e51968883b37e2`. Release branch: `codex/public-demo-free`.

## Completed checks

| Check | Actual result |
| --- | --- |
| Complete regression suite, `npm test` | 257 passed; 2 opt-in live-provider tests skipped |
| Frontend tests, `npm run test:frontend` | 4 passed |
| Lint, `npm run lint` | Passed, zero warnings/errors |
| TypeScript, `npm run typecheck` | Passed |
| Production build | Passed, including a clean source copy with no environment files, installed packages or local database at setup |
| Clean deployment command | `npm ci --include=dev`, `npx prisma generate`, `npm run build` passed |
| Full dependency audit | Zero known vulnerabilities, including zero high/critical |
| Production HTTP workflows | Both categories, both stages, two independent visitor cookie jars; validated three-agent findings/citations, computed recommendations, approval/rejection, stored history/audit and reset isolation passed |
| Browser workflows | RT-001 full approval and RT-002 full approval passed in isolated host-cookie sessions (`127.0.0.1` and `localhost`) in the available in-app browser; untouched alternate cases, reload and UI reset isolation verified |
| Clean-source browser smoke | Mock/session/help labels, RT-002 two-stage investigation, explicit approval and persisted resolution passed |
| Restart | Old HTTP cookies rejected; both cases freshly initialized; both browser sessions recovered fresh on reload |
| Public inference isolation | Full two-category test asserted zero `fetch` calls even with Groq mode inherited; production results identified mock; runtime Groq fetch blocked before network transmission |
| Abuse/concurrency | Session creation, per-session request/write budgets, oversized bodies, same-origin writes, forged cookies, source spoofing, duplicate evidence, case mutations, global concurrency and reset-during-work checks passed |
| Secret scan | Actual local credential absent from tracked/nonignored source, Git history and browser assets; common credential-pattern scans clean |
| Git exclusions | No environment files, databases, QA outputs, dependencies or build outputs selected for publication |
| Original database and branding | SHA-256 unchanged; original projects untouched |

The complete HTTP acceptance flow was also repeated against the clean-source production server. It needs no API key, `.env.local`, ignored SQLite snapshot or paid service. All resulting case state is disposable and monetary actions are simulated.

## Compatibility fixes and limits

The controlled upgrade replaced vulnerable Next.js/React, Vitest/Vite and CSS dependencies. A runtime circular import exposed by the patched test runner was removed by moving shared provider error classes into their own module. Provider behavior, Groq retry/recovery, policy evaluation, evidence validation and atomic human review remain covered by the regression suite.

The build emits a nonblocking notice that the Next ESLint plugin is absent. That plugin's unpatched vulnerable glob dependency was removed; explicit TypeScript parsing and React/hook lint checks remain enabled, as do Next's production type checks. An initial clean-copy ESLint parent-config conflict was fixed by declaring the configuration root; the final clean build passed.

Render YAML parses correctly and specifies one Free service with auto-deploy disabled. Settings were checked against official documentation. Full validation against Render's JSON Schema 2020-12 could not run with the older installed schema validator; actual platform acceptance has not been tested. Manual service creation is documented and does not depend on Blueprint import.

Recommended hosting: Render Free with ephemeral SQLite. Expect cold starts and loss of sessions after idle spin-down/restart. No persistence, real refunds, authenticated reviewer identity, horizontal scaling or guaranteed availability is claimed. Limits may temporarily reject legitimate traffic bursts. The HTTP/browser checks were local Windows checks, not Linux hosting or public TLS validation.

See [DEPLOYMENT.md](DEPLOYMENT.md) for exact GitHub creation, publication, free deployment, environment variables and post-deployment acceptance steps. Do not enable billing if the account cannot use Free; stop and discuss alternatives first.
