# Resolution presentation verification — 15 October 2026

Scope: Resolution component only, a Resolution-only presentation helper, scoped timeline styles and focused tests. Other pages, approved branding, backend/API contracts, deterministic policy, inference architecture and audit rendering are unchanged.

- Refund headings derive from persisted outcome, amount and approval state. APPROVED / REFUND_FULL displays “Full refund approved — S$5.00”; PENDING and REJECTED have distinct accurate wording. Raw codes remain secondary details.
- Matched-rule explanations display the concise recorded rule description once. Full original rationale, outcome/state, frozen snapshot and policy citations remain in expandable record details. Exact repeated sentences in other explanation formats are deduplicated only for display.
- Recommendation history runs earliest to latest. Adjacent frozen snapshots identify actual added evidence versions, including the independent geotag. Submission times come from matching SUBMIT_EVIDENCE audit records, not capture times. Later unchanged-snapshot recovery assessments do not invent another submission. No initial or later outcome is assumed.
- The side-panel title is “How we reached this decision”. Existing layout, colors, logo, citations and audit trail are retained.

Validation: `npm test` **197 passed, 2 existing opt-in smoke tests skipped**; `npm run test:frontend` **4 passed**; lint, typecheck and production build passed. The 11 new tests cover approval states, actual amounts/outcomes, original-text preservation, repeated sentences, decimals, unmatched rules, chronological history, evidence versions and recovery snapshots.

Browser validation used two disposable copies of the earlier mock verification database, served on ports 3120 and 3121. Pending wording was checked before any decision. The existing API then recorded one simulated approval in the first copy and one rejection in the second. Browser inspection confirmed both persisted states, the exact approved heading, one concise primary explanation, chronological insufficient-evidence → independent-geotag → refund history, the new side-panel title and accessible full original record details. The 1280-pixel layout had no horizontal overflow.

Preservation checks passed: the application database, source verification database and approved logo hashes are unchanged. Recommendation outcomes, amounts, explanations, snapshots, evidence and findings are unchanged in both copies. Existing audit events are preserved; only the respective simulated test decision was appended in each disposable copy. No Groq requests were made.

Sanitized local proof remains ignored under `qa/resolution-polish-verification.json`, `qa/resolution-polish-approved.png` and `qa/resolution-polish-history.png`. The approved preview is a disposable test case, not approval of the original case. No remote push or deployment is performed.
