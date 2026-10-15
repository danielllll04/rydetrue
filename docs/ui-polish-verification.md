# Investigation UI polish — 15 October 2026

This focused pass changes connected frontend presentation, its view-model helpers and tests. Backend handlers, API contracts, agent architecture/providers/prompts, deterministic policy and sufficiency logic, evidence/citation validators, approval endpoint, Prisma schema and approved branding are unchanged. No dependencies were added.

## Presentation changes

- A four-part journey distinguishes the recorded initial assessment, independent geotag availability, reinvestigation against the current snapshot and explicit human decision. Descriptions derive from recommendation history, evidence groups, snapshot freshness and investigation audit status. Initial outcomes and later refunds are not assumed. Changed phone evidence also directs the reviewer to reinvestigation.
- Rider and Driver cards explain independent advocacy; Neutral explains reconciliation and policy. Summaries, supporting/challenging claims, agreements/disagreements and citations come from validated persisted findings. Expandable original JSON retains the original wording, codes and IDs. No new advisory conclusions are generated in the frontend.
- Citations use readable evidence-group labels and exact version numbers. Clicking still inspects the exact evidence ID. Full IDs, current hashes, historical recomputed hashes, verification status and version history remain accessible. Unknown citations remain generic evidence records; newer evidence is never substituted for an older citation.
- Recommendation headings use plain English in investigation, resolution/history, case overview and decision dialogs. Original outcome codes remain secondary details. Findings themselves retain their original content in the expanded record.
- Approval and rejection share one frontend eligibility explanation. No recommendation, insufficient/contradictory evidence, stale or superseded snapshots, incomplete/failed integrity, closed/actioned cases, investigations in progress and nonpending/nonrefund recommendations disable both actions. Disabled controls look inactive and reference the visible explanation. Confirmation still re-reads current backend state; it also requires a nonblank reviewer and a reason of at least ten trimmed characters.
- At smaller desktop widths the evidence timeline moves below the three cards. Narrow layouts stack cards and decision actions and use a two-column journey. Existing pink/white branding, logo, shell and provider labels are retained.

## Automated validation

- `npm test`: **186 passed, 2 skipped**. Includes 20 focused presentation tests for eligibility reasons, historical citation labeling, all outcome labels, actual first outcomes, failed versus completed reinvestigation and changed phone evidence. The two skips are existing opt-in live-provider smoke tests.
- `npm run test:frontend`: **4 passed**.
- `npm run lint`: passed, no warnings/errors.
- `npm run typecheck`: passed.
- `npm run build`: passed, including build-time lint/types.
- Secret isolation scan: no locally configured credential in reviewable repository files or `.next/static`.

## Browser verification and data preservation

Production mock preview used disposable `qa/browser-run-1792037919535.db` on port 3115. Through the browser, the initial investigation produced the recorded insufficient-evidence recommendation with both human controls disabled. Explicit synthetic geotag submission made the old snapshot stale; both controls stayed disabled with a reinvestigation explanation. Reinvestigation produced the recorded S$5.00 full-refund recommendation, enabling both review dialogs. Both final confirmation buttons were disabled without a reason; both dialogs were canceled. No approval or rejection was submitted.

The real-provider presentation was inspected on port 3116 against a separate disposable copy of the previously verified Groq database. All three genuine role findings, the two validated-reuse labels, readable citations, full geotag ID/hash, three recommendation versions and pending human approval were verified. This pass made **zero new Groq requests**; it does not claim another live inference run.

Final responsive checks: at 1100×900 the three cards were 271 pixels wide; at 390×844 they stacked at 345 pixels wide. Neither layout had horizontal page overflow. The temporary viewport override was restored. Screenshots and sanitized browser checks remain under ignored `qa/`:

- `ui-polish-preview.png`, `ui-polish-desktop.png`, `ui-polish-mobile.png`
- `ui-polish-browser-checks.json`
- `ui-polish-verification.json`

The final preservation check passed: application database SHA-256 unchanged, approved logo unchanged, saved Groq source byte-identical to its untouched UI copy, zero human decision events in both previews, and zero Groq requests in mock mode or the saved-real-result inspection. Original projects remain untouched.

The initial preview ports 3105/3106 were occupied; existing demos were left running and validation moved to 3115/3116. One initial mock page load reported a connection error; its API returned 200 and an explicit refresh recovered the full case. Subsequent flow and final-build verification passed.

These changes do not remove Groq's existing quota/network constraints or add authentication or real monetary settlement. The mock demo remains the reliable presentation fallback. No remote push or deployment is part of this pass.
