# Free public demo deployment

Prepared for the 16 October 2026 submission. Publication and deployment require the owner's explicit approval; no push, deployment or billing activation is performed by preparing this release.

## Hosting choice

Use **Render Free**, one Node Web Service with ephemeral SQLite. No paid disk, paid database or external service is needed. A static site/GitHub Pages cannot run the investigation APIs. Render supports [full Next.js applications](https://render.com/docs/deploy-nextjs-app).

Expected cost: **US$0**, within the Free allocation. Free web services have no fixed trial expiry, but no uptime guarantee. They sleep after 15 minutes idle, take about a minute to wake, and lose local files on sleep/restart/redeploy. The workspace shares 750 free instance hours/month plus bandwidth/build quotas. With no payment method, exceeding quotas suspends service or builds instead of charging. Check existing workspace usage and eligibility; do not add billing to bypass a restriction without approval. [Render Free restrictions](https://render.com/docs/free).

Railway's alternative trial provides US$5 for up to 30 days, ending earlier when credits run out, then a small Free allowance. Trial verification/egress limits and credit expiry introduce deadline risk. It is not the preferred option here. [Railway trial terms](https://docs.railway.com/pricing/free-trial).

## 1. Create the public GitHub repository

1. Sign in to GitHub. Choose **New repository**, name `rydetrue`, visibility **Public**. Leave initial README, licence and `.gitignore` unchecked; the remote must be empty.
2. Open a terminal in this integration repository (not either original project). On this workstation:

```powershell
Set-Location -LiteralPath 'C:\Users\Daniel\OneDrive\文档\ChatGPT\Singapore Tencent Hackathon\ryde-integration'
git switch codex/public-demo-free
git status --short
git ls-files
git remote -v
```

3. Confirm no environment file, API key, database, QA output, `node_modules` or `.next` content is tracked. Do not upload a folder ZIP containing ignored local files. Replace `YOUR_GITHUB_USERNAME` below. These are instructions for later publication, not commands already executed:

```sh
# Only if origin is absent:
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/rydetrue.git
git push -u origin HEAD:main
```

If an origin already exists, inspect it before changing anything. Do not force push. This creates remote `main` without renaming or merging the preserved local feature branches.

4. Open `https://github.com/YOUR_GITHUB_USERNAME/rydetrue` while signed out. Use that public repository URL in the form.

## 2. Create the Render Free web service

1. Sign in to Render, choose **New → Web Service**, and connect only the new GitHub repository. Select branch `main`. The root directory is blank when this integration repository itself is published. Alternatively import the supplied `render.yaml` as a Blueprint and verify the resulting resource is Free before confirming.
2. Select **Node**, **Free**, one instance, and Singapore region if available. Disable automatic deploys for the presentation release. Do not create a persistent disk, external database or paid workspace.
3. Configure:

| Setting       | Exact value                                                    |
| ------------- | -------------------------------------------------------------- |
| Build command | `npm ci --include=dev && npx prisma generate && npm run build` |
| Start command | `npm run start:public`                                         |
| Health check  | `/workspace`                                                   |

4. Configure only these environment variables, also declared in `render.yaml`:

| Variable                  | Value                             |
| ------------------------- | --------------------------------- |
| `NODE_VERSION`            | `22.23.3`                         |
| `NODE_ENV`                | `production`                      |
| `NEXT_TELEMETRY_DISABLED` | `1`                               |
| `RYDETRUE_PUBLIC_DEMO`    | `true`                            |
| `RYDETRUE_LLM_MODE`       | `mock`                            |
| `PORT`                    | Provided by Render; leave default |

No `DATABASE_URL`, session secret, `.env.local`, API key, Groq endpoint or live model is required. Keep dev dependencies installed: Prisma generation and the build need developer tools. Do not run destructive `db:reset` or the legacy local seed. The public session initializer creates the schema and both fixtures automatically in server-owned temporary files. [Render web-service port/TLS documentation](https://render.com/docs/web-services).

5. Deploy manually and inspect the build/health logs. Open the assigned `https://<service-name>.onrender.com/` URL. No account action, deploy or HTTPS URL has been verified until this step is performed.

## 3. Public acceptance check before submitting

- Open the HTTPS URL in two different browsers or independent private profiles. Confirm root redirection, clear simulated-agent labeling and both case choices.
- In one session complete RT-001: initial insufficient evidence → independent geotag → reinvestigation → explicit human approval → persisted resolution/history/audit.
- In the other session verify RT-001 still starts fresh, then complete RT-002: initial insufficient pricing evidence → supplied pricing audit → reinvestigation → computed partial refund → human review → persisted history/audit.
- Reset one session and verify the other retains its records. Reload both. No visitor must see another's evidence or decisions.
- Redeploy/restart, then refresh both sessions. Both should begin again from the synthetic Stage 1 fixtures. This loss of temporary state is expected.
- Confirm there are no Groq environment variables configured; all investigation results and audit provider identities must say mock. Public runtime blocks external server fetches; local tests assert zero inference fetch calls through the full journeys.
- Confirm the public GitHub repository and HTTPS demo open while signed out. Submit these two actual URLs, never localhost.

The free service may display Render's wake-up page for about a minute after inactivity. Open it shortly before judging to allow the cold start. No paid keepalive or automatic traffic service is configured.

## Remaining prototype limits

Sessions last 30 minutes or until process restart. Cookies are random bearer capabilities, not authenticated user/reviewer identities. Browser tabs sharing cookies share a demo. Human approvals and monetary actions are simulated. Audit history survives only within its temporary session. Run one instance/process: session lookup and concurrency locks are in memory. Creation/request/write caps can temporarily reject users during bursts or abuse; 429 responses include a retry interval. These safeguards do not guarantee DDoS resistance or production security.

Only supplied synthetic Stage 2 evidence is accepted publicly. No arbitrary verified-source uploads are offered. Deterministic policy, evidence integrity, citations and atomic review eligibility remain enforced.

Local Windows validation cannot guarantee Linux-host memory, account verification, current provider quota or public TLS behavior. A successful actual hosted two-category acceptance check is still required before claiming the submission URL works. If Render requires a payment method or paid service, stop and discuss alternatives rather than enabling billing.
