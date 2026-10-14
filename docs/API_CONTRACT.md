# RydeTRUE API Contract — Milestone 2

> Evidence-led dispute resolution platform.
> Tagline: Two sides. One fair resolution.

This document defines the HTTP API contract for RydeTRUE Milestone 2.
All data is synthetic. No production Ryde services are contacted and no real
refunds are processed.

## Contents

1. [Conventions](#1-conventions)
2. [Case Status Values](#2-case-status-values)
3. [Evidence Sufficiency States](#3-evidence-sufficiency-states)
4. [Recommendation Outcomes](#4-recommendation-outcomes)
5. [Approval States](#5-approval-states)
6. [Evidence Types](#6-evidence-types)
7. [Investigation Status Values](#7-investigation-status-values)
8. [Agent Roles](#8-agent-roles)
9. [Endpoints](#9-endpoints)
10. [Citation Format](#10-citation-format)
11. [Evidence Snapshot Format](#11-evidence-snapshot-format)
12. [Error Response Format](#12-error-response-format)
13. [Example: Stage 1 — Insufficient Evidence](#13-example-stage-1--insufficient-evidence)
14. [Example: Stage 2 — REFUND_FULL](#14-example-stage-2--refund_full)
15. [Example: Multi-Agent Investigation (Stage 1)](#15-example-multi-agent-investigation-stage-1)

---

## 1. Conventions

- All endpoints accept and return JSON (`Content-Type: application/json`).
- Timestamps are ISO 8601 UTC strings (`2026-10-12T14:30:00.000Z`).
- Monetary amounts are in cents (integer). `500` = SGD 5.00.
- No authentication in M1.5 — the `actor` field is trusted-as-claimed (placeholder).
- All monetary actions are simulated and require human approval.

## 2. Case Status Values

| Status | Description |
|---|---|
| `OPEN` | Dispute newly filed, not yet evaluated. |
| `INVESTIGATING` | System is processing evidence (future: AI agents active). |
| `PENDING_REVIEW` | Evidence insufficient or ambiguous; requires human review. |
| `EVALUATED` | Recommendation issued; no monetary action required. |
| `AWAITING_APPROVAL` | Recommendation with refund issued; awaiting human approval. |
| `APPROVED` | Human approved the refund (simulated execution). |
| `REJECTED` | Human rejected the recommendation. |
| `REOPENED` | Case reopened after new evidence submitted. |
| `CLOSED` | Case closed. |

## 3. Evidence Sufficiency States

Checked **before** policy evaluation. If not `SUFFICIENT`, no policy rule is applied.

| State | Description |
|---|---|
| `SUFFICIENT` | All required evidence present; policy evaluation proceeds. |
| `INSUFFICIENT_EVIDENCE` | Critical evidence is missing (e.g., no independent geotag). |
| `CONTRADICTORY_EVIDENCE` | Evidence present but mutually inconsistent (GPS vs geotag disagree by > 100m). |
| `ESCALATE_FOR_REVIEW` | Evidence sufficient but no policy rule clearly matches. |

**Safety principle**: GPS proximity alone can **never** prove a party's claim.
An independent `THIRD_PARTY_GEOTAG` is required for any pickup-location
determination.

## 4. Recommendation Outcomes

| Outcome | Refund? | Description |
|---|---|---|
| `REFUND_FULL` | Yes (full cancellation fee) | Policy conditions met for full refund. |
| `REFUND_PARTIAL` | Yes (partial) | Policy conditions met for partial refund. |
| `NO_REFUND` | No | Policy conditions met for retaining the fee. |
| `SPLIT` | Yes (50%) | Evidence does not clearly favour either side. |
| `INSUFFICIENT_EVIDENCE` | No | Evidence is insufficient; no rule applied. |
| `ESCALATE_FOR_REVIEW` | No | Evidence sufficient but ambiguous; needs human review. |
| `INCONCLUSIVE` | No | Contradictory evidence or no rule matched. |

## 5. Approval States

Applies to recommendations with `refundCents > 0`.

| State | Description |
|---|---|
| `PENDING` | Awaiting human approval (default for monetary actions). |
| `APPROVED` | Human approved; simulated refund executed. |
| `REJECTED` | Human rejected; no refund. |
| `NOT_APPLICABLE` | No monetary action (e.g., INSUFFICIENT_EVIDENCE, NO_REFUND). |

## 6. Evidence Types

| Type | Source | Description |
|---|---|---|
| `GPS_PING` | `RIDER_PHONE` / `DRIVER_PHONE` | GPS trail from phone. Has `accuracyM` — if > 50m, flagged as vague. |
| `PHOTO_META` | `RIDER_PHONE` / `DRIVER_PHONE` | Photo metadata (EXIF, dimensions). |
| `CHAT_LOG` | `PLATFORM` | In-app chat messages between rider, driver, platform. |
| `TRIP_TELEMETRY` | `PLATFORM` | Platform telemetry: arrival, cancellation, wait time. |
| `AUDIO_META` | `RIDER_PHONE` / `DRIVER_PHONE` | Audio recording metadata. |
| `THIRD_PARTY_GEOTAG` | `THIRD_PARTY` | Independent geotag with `designatedEntrance` and `driverActualLocation`. Required for pickup-location disputes. |

## 7. Investigation Status Values

Returned by `POST /api/cases/{id}/investigate` in the top-level `status` field.

| Status | Description |
|---|---|
| `COMPLETED` | All three agents completed successfully; recommendation issued. |
| `PARTIAL` | Agents completed, but the neutral agent's explanation may conflict with the deterministic policy outcome. Deterministic result is still authoritative. |
| `FAILED` | Investigation could not start (case not found, evidence tampered, policy not found). No agents ran. |
| `ESCALATED` | One or more agents failed (provider error, invalid output, citation validation failure). Case requires human review. The deterministic recommendation may still be issued if sufficiency and policy evaluation succeeded before the agent failure. |

## 8. Agent Roles

Three distinct LLM-powered agents run during each investigation. Each agent's
output is validated against a Zod schema and persisted as an `AgentFinding`
record in the database. Agent outputs are **advisory** — they cannot override
the deterministic policy outcome or approve refunds.

| Agent Role | DB Value | Description |
|---|---|---|
| Rider Advocate | `RIDER_ADVOCATE` | Investigates the rider's claim. Has access to evidence tools (list, detail, statements, trip info). Produces supporting points, weakening points, and unresolved questions. |
| Driver Advocate | `DRIVER_ADVOCATE` | Investigates the driver's claim. Same tool access as Rider Advocate. Runs independently in parallel. |
| Neutral Resolution | `NEUTRAL_RESOLUTION` | Receives both advocate findings + evidence snapshot + deterministic results. No tools — all data provided in context. Produces agreements, disagreements, and a recommendation explanation that must align with the deterministic policy outcome. |

### Agent Execution Status

Each agent returns one of these statuses:

| Status | Description |
|---|---|
| `COMPLETED` | Agent ran successfully and produced a valid finding. |
| `FAILED` | Agent output failed schema or citation validation. |
| `ESCALATED` | Provider error (timeout, network error, invalid response). |
| `SKIPPED` | Agent was not run (e.g., investigation failed before this agent could execute). |

## 9. Endpoints

### GET /api/cases

List all disputes.

**Response** (200):
```json
{
  "cases": [
    {
      "caseCode": "RT-001",
      "category": "CANCELLATION_FEE",
      "status": "OPEN",
      "openedAt": "2026-10-12T14:30:00.000Z",
      "city": "Singapore",
      "cancellationFeeCents": 500,
      "hasRecommendation": false,
      "recommendationOutcome": null,
      "recommendationCount": 0
    }
  ]
}
```

### GET /api/cases/{id}

Get full case detail. `{id}` is the case code (e.g., `RT-001`).

**Response** (200): Full case object including:
- `trip`: trip metadata
- `statements`: array of rider/driver statements
- `evidence.groups`: evidence grouped by `refGroup`, latest version only
- `evidence.integrity`: hash verification status per evidence record
- `recommendationHistory`: array of all recommendations (superseded + current)
- `currentRecommendation`: the current (non-superseded) recommendation, or null
- `audit`: immutable audit log

**Error** (404): `{ "error": "case_not_found", "caseCode": "..." }`

### POST /api/cases/{id}/evidence

Submit additional synthetic evidence. Creates a new evidence version (or new
refGroup). Old evidence is preserved — never overwritten.

**Request body**:
```json
{
  "type": "THIRD_PARTY_GEOTAG",
  "source": "THIRD_PARTY",
  "refGroup": "third-party-geotag",
  "payload": {
    "type": "THIRD_PARTY_GEOTAG",
    "providerName": "Changi Airport Ground Operations Log",
    "designatedEntrance": { "lat": 1.35457, "lng": 103.98725 },
    "driverActualLocation": { "lat": 1.35400, "lng": 103.98650 },
    "capturedAt": "2026-10-12T14:33:20.000Z"
  },
  "capturedAt": "2026-10-12T14:33:20.000Z",
  "notes": "Stage 2: airport ground operations geotag",
  "actor": "system:stage2"
}
```

**Response** (201):
```json
{
  "caseCode": "RT-001",
  "evidence": {
    "id": "cmv...",
    "type": "THIRD_PARTY_GEOTAG",
    "source": "THIRD_PARTY",
    "refGroup": "third-party-geotag",
    "version": 1,
    "hash": "a1b2c3...",
    "capturedAt": "2026-10-12T14:33:20.000Z",
    "notes": "Stage 2: airport ground operations geotag"
  }
}
```

**Errors**:
- 400: `{ "error": "invalid_request", "details": "..." }` — malformed request
- 400: `{ "error": "invalid_evidence_payload", "details": "...", "evidenceType": "..." }` — payload fails Zod validation
- 404: `{ "error": "case_not_found", "caseCode": "..." }`

### POST /api/cases/{id}/evaluate

Evaluate (or re-evaluate) the dispute against a policy version. Runs the
sufficiency checker first; if not SUFFICIENT, no policy rule is applied.

**Request body**:
```json
{
  "policyCode": "CANCELLATION_FEE_SG",
  "asOf": "2026-10-12T14:30:00.000Z",
  "actor": "system"
}
```
- `policyCode` (required): policy code to evaluate against.
- `asOf` (optional): ISO datetime for selecting the policy version effective at that time. Defaults to now.
- `actor` (optional, default `"system"`): who triggered the evaluation.

**Response** (200):
```json
{
  "caseCode": "RT-001",
  "recommendation": {
    "id": "cmv...",
    "outcome": "REFUND_FULL",
    "sufficiencyState": "SUFFICIENT",
    "refundCents": 500,
    "rationale": "Independent geotag confirms driver waited at a different entrance...",
    "citations": [
      { "evidenceId": "cmv...", "ruleId": null, "note": "Driver GPS trail: ..." },
      { "evidenceId": "cmv...", "ruleId": null, "note": "Rider GPS trail: ..." },
      { "evidenceId": "cmv...", "ruleId": null, "note": "Independent geotag from ..." },
      { "evidenceId": "cmv...", "ruleId": null, "note": "Trip fare ..." },
      { "evidenceId": "policy", "ruleId": "SG-CXL-R1", "note": "Matched rule SG-CXL-R1" }
    ],
    "policyCode": "CANCELLATION_FEE_SG",
    "policyVersion": 2,
    "matchedRuleId": "SG-CXL-R1",
    "approvalState": "PENDING",
    "evidenceSnapshot": [
      { "evidenceId": "cmv...", "refGroup": "rider-gps", "type": "GPS_PING", "version": 1, "hash": "..." },
      { "evidenceId": "cmv...", "refGroup": "driver-gps", "type": "GPS_PING", "version": 1, "hash": "..." },
      { "evidenceId": "cmv...", "refGroup": "trip-chat", "type": "CHAT_LOG", "version": 1, "hash": "..." },
      { "evidenceId": "cmv...", "refGroup": "trip-telemetry", "type": "TRIP_TELEMETRY", "version": 1, "hash": "..." },
      { "evidenceId": "cmv...", "refGroup": "third-party-geotag", "type": "THIRD_PARTY_GEOTAG", "version": 1, "hash": "..." }
    ],
    "recommendationHash": "a1b2c3...",
    "supersededRecommendationId": "cmv...",
    "metrics": {
      "driverLastPos": { "lat": 1.35410, "lng": 103.98660 },
      "riderLastPos": { "lat": 1.35460, "lng": 103.98720 },
      "driverDistanceToPickupM": 89,
      "riderDistanceToPickupM": 10,
      "waitSeconds": 180,
      "designatedEntrance": { "lat": 1.35457, "lng": 103.98725 },
      "driverActualLocation": { "lat": 1.35400, "lng": 103.98650 },
      "driverDistanceToDesignatedEntranceM": 100
    }
  },
  "sufficiency": {
    "state": "SUFFICIENT",
    "reasons": ["All required evidence present..."],
    "missingRequirements": []
  }
}
```

**Errors**:
- 400: `{ "error": "invalid_request", "details": "..." }`
- 404: `{ "error": "case_not_found" }` or `{ "error": "policy_not_found", "code": "...", "asOf": "..." }`
- 422: `{ "error": "evidence_integrity_failed", "corruptEvidenceIds": ["..."] }`

### POST /api/cases/{id}/investigate

Run a full multi-agent investigation. Three LLM-powered agents (Rider
Advocate, Driver Advocate, Neutral Resolution) analyze the case using
case-scoped evidence retrieval tools. The deterministic sufficiency checker
and policy engine run independently — agent outputs are advisory and
cannot override the deterministic policy outcome or approve refunds.

**Prerequisites**: Set `RYDETRUE_LLM_API_KEY` in `.env` to use a real LLM
provider. Without it, in test mode a deterministic mock provider is used;
in production, the provider throws `NOT_CONFIGURED` and the investigation
escalates to human review.

**Request body**:
```json
{
  "policyCode": "CANCELLATION_FEE_SG",
  "actor": "system:orchestrator"
}
```
- `policyCode` (required): policy code to evaluate against.
- `actor` (optional, default `"system"`): who triggered the investigation.

**Response** (200 — `COMPLETED`, `PARTIAL`, or `ESCALATED`):
```json
{
  "investigationId": "inv_1701234567890_a1b2c3",
  "caseCode": "RT-001",
  "status": "COMPLETED",
  "agents": {
    "riderAdvocate": {
      "status": "COMPLETED",
      "finding": {
        "agentRole": "RIDER_ADVOCATE",
        "party": "RIDER",
        "supportingPoints": [
          {
            "claim": "Rider was waiting at the designated pickup entrance",
            "citedEvidenceIds": ["cmv..."],
            "note": "Rider GPS shows proximity to the pickup pin."
          }
        ],
        "weakeningPoints": [
          {
            "claim": "Rider GPS accuracy is poor (80m)",
            "citedEvidenceIds": ["cmv..."],
            "note": "GPS accuracy exceeds 50m threshold."
          }
        ],
        "uncertaintyLevel": "MEDIUM",
        "summary": "The rider appears to have been at the designated pickup location...",
        "unresolvedQuestions": [
          "Where exactly was the driver waiting relative to the designated entrance?"
        ]
      },
      "error": null,
      "toolCallsUsed": 4,
      "durationMs": 3200
    },
    "driverAdvocate": {
      "status": "COMPLETED",
      "finding": { "agentRole": "DRIVER_ADVOCATE", "..." : "..." },
      "error": null,
      "toolCallsUsed": 4,
      "durationMs": 3100
    },
    "neutralResolution": {
      "status": "COMPLETED",
      "finding": {
        "agreements": [
          {
            "point": "Both parties agree a cancellation fee was charged",
            "citedEvidenceIds": ["cmv..."],
            "note": "The trip telemetry confirms a cancellation fee of SGD 5.00."
          }
        ],
        "disagreements": [
          {
            "point": "Whether the driver was at the designated entrance",
            "riderPosition": "Rider claims driver never arrived at Door 1",
            "driverPosition": "Driver claims they arrived and waited",
            "citedEvidenceIds": ["cmv...", "cmv..."],
            "note": "GPS data from both parties is too imprecise to resolve this."
          }
        ],
        "unresolvedQuestions": [
          "Where exactly was the driver waiting relative to the designated entrance?"
        ],
        "sufficiencyAssessment": "Evidence is insufficient — no independent geotag...",
        "policyAssessment": "No policy rule can be applied because evidence is insufficient.",
        "recommendationExplanation": "Evidence is insufficient to make a determination...",
        "citedEvidenceIds": ["cmv...", "cmv...", "cmv..."],
        "uncertaintyLevel": "HIGH"
      },
      "error": null,
      "toolCallsUsed": 0,
      "durationMs": 1500
    }
  },
  "evidenceSnapshot": [
    {
      "evidenceId": "cmv...",
      "refGroup": "rider-gps",
      "type": "GPS_PING",
      "source": "RIDER_PHONE",
      "version": 1,
      "hash": "a1b2c3...",
      "capturedAt": "2026-10-12T14:31:00.000Z",
      "payload": { "..." : "..." }
    }
  ],
  "sufficiency": {
    "state": "INSUFFICIENT_EVIDENCE",
    "reasons": [
      "No independent geotag confirming the designated entrance...",
      "Rider GPS accuracy (80m) exceeds threshold (50m)..."
    ],
    "missingRequirements": ["THIRD_PARTY_GEOTAG"]
  },
  "policyRecommendation": {
    "outcome": "INSUFFICIENT_EVIDENCE",
    "refundCents": 0,
    "matchedRuleId": null,
    "approvalState": "NOT_APPLICABLE",
    "rationale": "Evidence is INSUFFICIENT_EVIDENCE. No policy rule applied...",
    "policyCode": "CANCELLATION_FEE_SG",
    "policyVersion": 2,
    "recommendationId": "cmv..."
  },
  "humanApprovalRequired": false,
  "escalationReason": null
}
```

**Response** (422 — `FAILED`):
```json
{
  "investigationId": "inv_...",
  "caseCode": "UNKNOWN",
  "status": "FAILED",
  "agents": {
    "riderAdvocate": { "status": "SKIPPED", "finding": null, "error": "Case not found", "toolCallsUsed": 0, "durationMs": 0 },
    "driverAdvocate": { "status": "SKIPPED", "finding": null, "error": "Case not found", "toolCallsUsed": 0, "durationMs": 0 },
    "neutralResolution": { "status": "SKIPPED", "finding": null, "error": "Case not found", "toolCallsUsed": 0, "durationMs": 0 }
  },
  "evidenceSnapshot": [],
  "sufficiency": { "state": "INSUFFICIENT_EVIDENCE", "reasons": ["Case not found"], "missingRequirements": [] },
  "policyRecommendation": {
    "outcome": "INSUFFICIENT_EVIDENCE",
    "refundCents": 0,
    "matchedRuleId": null,
    "approvalState": "NOT_APPLICABLE",
    "rationale": "Investigation failed (case_not_found): Case not found",
    "policyCode": "unknown",
    "policyVersion": 0,
    "recommendationId": null
  },
  "humanApprovalRequired": false,
  "escalationReason": "Investigation failed (case_not_found): Case not found"
}
```

**Errors**:
- 400: `{ "error": "invalid_request", "details": "..." }` — malformed request body
- 422: `{ "status": "FAILED", "escalationReason": "..." }` — case not found, evidence integrity failed, or policy not found

**Security properties**:
- Agent outputs are validated against Zod schemas (`advocateFindingSchema`, `neutralResolutionSchema`).
- All cited evidence IDs are validated against the frozen evidence snapshot — fabricated IDs cause the agent to fail.
- The deterministic policy outcome is authoritative — agent outputs cannot override it.
- No chain-of-thought is stored — only structured findings are persisted.
- Provider failures (timeout, network error) fall back to human review (`ESCALATED`).
- The human approval gate is preserved — agents cannot approve refunds.
- Evidence snapshot is frozen at investigation start — drift is detected via hash comparison.
- Statement text is treated as untrusted input — prompt injection in statements cannot change the policy outcome.

### POST /api/cases/{id}/recommendations/{recId}/approve

Human approval or rejection of a recommendation. Only `PENDING` recommendations
can be actioned. All monetary actions are simulated.

**Request body**:
```json
{
  "decision": "APPROVED",
  "actor": "reviewer:operator-1",
  "notes": "Reviewed; evidence supports refund."
}
```
- `decision` (required): `"APPROVED"` or `"REJECTED"`.
- `actor` (required): who is making the decision.
- `notes` (optional): free-text rationale.

**Response** (200):
```json
{
  "caseCode": "RT-001",
  "recommendation": {
    "id": "cmv...",
    "outcome": "REFUND_FULL",
    "sufficiencyState": "SUFFICIENT",
    "refundCents": 500,
    "approvalState": "APPROVED",
    "approvedBy": "reviewer:operator-1",
    "approvedAt": "2026-10-12T15:00:00.000Z",
    "rationale": "...",
    "citations": [...],
    "evidenceSnapshot": [...],
    "policyVersionId": "cmv...",
    "supersededById": null,
    "createdAt": "2026-10-12T14:35:00.000Z",
    "simulated": true
  }
}
```

**Errors**:
- 400: `{ "error": "invalid_request", "details": "..." }`
- 404: `{ "error": "case_not_found" }` or `{ "error": "recommendation_not_found" }`
- 409: `{ "error": "already_actioned", "currentApprovalState": "APPROVED" }`

### GET /api/policies

List all policy versions.

**Response** (200):
```json
{
  "policies": [
    {
      "id": "cmv...",
      "code": "CANCELLATION_FEE_SG",
      "version": 1,
      "description": "Singapore cancellation-fee policy v1...",
      "effectiveFrom": "2026-01-01T00:00:00.000Z",
      "effectiveTo": "2026-06-30T23:59:59.000Z",
      "rules": {
        "rules": [...],
        "fallback": {...}
      }
    },
    {
      "id": "cmv...",
      "code": "CANCELLATION_FEE_SG",
      "version": 2,
      "description": "Singapore cancellation-fee policy v2...",
      "effectiveFrom": "2026-07-01T00:00:00.000Z",
      "effectiveTo": null,
      "rules": {
        "rules": [...],
        "fallback": {...}
      }
    }
  ]
}
```

## 10. Citation Format

Each recommendation includes a `citations` array. Each citation has:

```json
{
  "evidenceId": "cmv...",   // Prisma ID of the evidence, or "policy" for policy citations
  "ruleId": "SG-CXL-R1",    // null for evidence citations, or the matched rule ID
  "note": "..."             // Human-readable explanation of what this citation proves
}
```

## 11. Evidence Snapshot Format

Each recommendation includes an `evidenceSnapshot` array listing which evidence
versions were considered:

```json
{
  "evidenceId": "cmv...",
  "refGroup": "third-party-geotag",
  "type": "THIRD_PARTY_GEOTAG",
  "version": 1,
  "hash": "a1b2c3..."
}
```

## 12. Error Response Format

All errors return a JSON object with at minimum an `error` field:

```json
{ "error": "error_code", ... additional fields ... }
```

| Error Code | HTTP Status | Description |
|---|---|---|
| `invalid_request` | 400 | Request body failed Zod validation. |
| `invalid_evidence_payload` | 400 | Evidence payload failed schema validation. |
| `case_not_found` | 404 | Case code not found. |
| `policy_not_found` | 404 | No policy version effective at the given `asOf`. |
| `recommendation_not_found` | 404 | Recommendation ID not found for this case. |
| `evidence_integrity_failed` | 422 | One or more evidence hashes don't match their payloads. |
| `already_actioned` | 409 | Recommendation already approved or rejected. |

## 13. Example: Stage 1 — Insufficient Evidence

**Request**:
```bash
POST /api/cases/RT-001/evaluate
{ "policyCode": "CANCELLATION_FEE_SG" }
```

**Response** (200):
```json
{
  "caseCode": "RT-001",
  "recommendation": {
    "id": "cmv-stage1",
    "outcome": "INSUFFICIENT_EVIDENCE",
    "sufficiencyState": "INSUFFICIENT_EVIDENCE",
    "refundCents": 0,
    "rationale": "Evidence is INSUFFICIENT_EVIDENCE. No policy rule applied. Case requires additional evidence or human review. No conclusion is drawn about either party's claim.",
    "citations": [
      { "evidenceId": "cmv-driver-gps", "ruleId": null, "note": "Driver GPS trail: 1 pings; last at 1.35410, 103.98660; 89m from pickup pin." },
      { "evidenceId": "cmv-rider-gps", "ruleId": null, "note": "Rider GPS trail: 1 pings; last at 1.35460, 103.98720; 10m from pickup pin." },
      { "evidenceId": "cmv-trip", "ruleId": null, "note": "Trip fare 1850 cents; cancellation fee charged 500 cents; wait time 180s." }
    ],
    "policyCode": "CANCELLATION_FEE_SG",
    "policyVersion": 2,
    "matchedRuleId": null,
    "approvalState": "NOT_APPLICABLE",
    "evidenceSnapshot": [
      { "evidenceId": "cmv-rider-gps", "refGroup": "rider-gps", "type": "GPS_PING", "version": 1, "hash": "..." },
      { "evidenceId": "cmv-driver-gps", "refGroup": "driver-gps", "type": "GPS_PING", "version": 1, "hash": "..." },
      { "evidenceId": "cmv-trip-chat", "refGroup": "trip-chat", "type": "CHAT_LOG", "version": 1, "hash": "..." },
      { "evidenceId": "cmv-trip-telemetry", "refGroup": "trip-telemetry", "type": "TRIP_TELEMETRY", "version": 1, "hash": "..." }
    ],
    "recommendationHash": "abc123...",
    "supersededRecommendationId": null,
    "metrics": {
      "driverLastPos": { "lat": 1.35410, "lng": 103.98660 },
      "riderLastPos": { "lat": 1.35460, "lng": 103.98720 },
      "driverDistanceToPickupM": 89,
      "riderDistanceToPickupM": 10,
      "waitSeconds": 180,
      "designatedEntrance": null,
      "driverActualLocation": null,
      "driverDistanceToDesignatedEntranceM": null
    }
  },
  "sufficiency": {
    "state": "INSUFFICIENT_EVIDENCE",
    "reasons": [
      "No independent geotag confirming the designated entrance and driver's actual location. GPS proximity alone cannot prove a claim.",
      "Rider GPS accuracy (80m) exceeds threshold (50m); rider GPS will not be used as sole proof of pickup location.",
      "Driver GPS accuracy (80m) exceeds threshold (50m); driver GPS will not be used as sole proof of pickup location."
    ],
    "missingRequirements": ["THIRD_PARTY_GEOTAG"]
  }
}
```

## 14. Example: Stage 2 — REFUND_FULL

**Step 1: Submit new evidence**

```bash
POST /api/cases/RT-001/evidence
{
  "type": "THIRD_PARTY_GEOTAG",
  "source": "THIRD_PARTY",
  "refGroup": "third-party-geotag",
  "payload": {
    "type": "THIRD_PARTY_GEOTAG",
    "providerName": "Changi Airport Ground Operations Log",
    "designatedEntrance": { "lat": 1.35457, "lng": 103.98725 },
    "driverActualLocation": { "lat": 1.35400, "lng": 103.98650 },
    "capturedAt": "2026-10-12T14:33:20.000Z"
  },
  "capturedAt": "2026-10-12T14:33:20.000Z",
  "actor": "system:stage2"
}
```

**Step 2: Re-evaluate**

```bash
POST /api/cases/RT-001/evaluate
{ "policyCode": "CANCELLATION_FEE_SG" }
```

**Response** (200):
```json
{
  "caseCode": "RT-001",
  "recommendation": {
    "id": "cmv-stage2",
    "outcome": "REFUND_FULL",
    "sufficiencyState": "SUFFICIENT",
    "refundCents": 500,
    "rationale": "Independent geotag confirms driver waited at a different entrance — Independent geotag confirms driver waited at a different entrance than the designated pickup. Cancellation fee refunded in full.",
    "citations": [
      { "evidenceId": "cmv-driver-gps", "ruleId": null, "note": "Driver GPS trail: ..." },
      { "evidenceId": "cmv-rider-gps", "ruleId": null, "note": "Rider GPS trail: ..." },
      { "evidenceId": "cmv-geotag", "ruleId": null, "note": "Independent geotag from Changi Airport Ground Operations Log: designated entrance at 1.35457, 103.98725; driver actual location at 1.35400, 103.98650; 100m apart." },
      { "evidenceId": "cmv-trip", "ruleId": null, "note": "Trip fare 1850 cents; cancellation fee charged 500 cents; wait time 180s." },
      { "evidenceId": "policy", "ruleId": "SG-CXL-R1", "note": "Matched rule SG-CXL-R1" }
    ],
    "policyCode": "CANCELLATION_FEE_SG",
    "policyVersion": 2,
    "matchedRuleId": "SG-CXL-R1",
    "approvalState": "PENDING",
    "evidenceSnapshot": [
      { "evidenceId": "cmv-rider-gps", "refGroup": "rider-gps", "type": "GPS_PING", "version": 1, "hash": "..." },
      { "evidenceId": "cmv-driver-gps", "refGroup": "driver-gps", "type": "GPS_PING", "version": 1, "hash": "..." },
      { "evidenceId": "cmv-trip-chat", "refGroup": "trip-chat", "type": "CHAT_LOG", "version": 1, "hash": "..." },
      { "evidenceId": "cmv-trip-telemetry", "refGroup": "trip-telemetry", "type": "TRIP_TELEMETRY", "version": 1, "hash": "..." },
      { "evidenceId": "cmv-geotag", "refGroup": "third-party-geotag", "type": "THIRD_PARTY_GEOTAG", "version": 1, "hash": "..." }
    ],
    "recommendationHash": "def456...",
    "supersededRecommendationId": "cmv-stage1",
    "metrics": {
      "driverLastPos": { "lat": 1.35410, "lng": 103.98660 },
      "riderLastPos": { "lat": 1.35460, "lng": 103.98720 },
      "driverDistanceToPickupM": 89,
      "riderDistanceToPickupM": 10,
      "waitSeconds": 180,
      "designatedEntrance": { "lat": 1.35457, "lng": 103.98725 },
      "driverActualLocation": { "lat": 1.35400, "lng": 103.98650 },
      "driverDistanceToDesignatedEntranceM": 100
    }
  },
  "sufficiency": {
    "state": "SUFFICIENT",
    "reasons": [
      "All required evidence present: both statements, trip telemetry, and independent geotag.",
      "Rider GPS accuracy (80m) exceeds threshold (50m); rider GPS will not be used as sole proof of pickup location.",
      "Driver GPS accuracy (80m) exceeds threshold (50m); driver GPS will not be used as sole proof of pickup location."
    ],
    "missingRequirements": []
  }
}
```

**Step 3: Approve**

```bash
POST /api/cases/RT-001/recommendations/cmv-stage2/approve
{ "decision": "APPROVED", "actor": "reviewer:operator-1" }
```

**Response** (200):
```json
{
  "caseCode": "RT-001",
  "recommendation": {
    "id": "cmv-stage2",
    "outcome": "REFUND_FULL",
    "sufficiencyState": "SUFFICIENT",
    "refundCents": 500,
    "approvalState": "APPROVED",
    "approvedBy": "reviewer:operator-1",
    "approvedAt": "2026-10-12T15:00:00.000Z",
    "simulated": true
  }
}
```

**Step 4: Retrieve case detail with history**

```bash
GET /api/cases/RT-001
```

The response includes `recommendationHistory` with both the Stage 1
(INSUFFICIENT_EVIDENCE, superseded) and Stage 2 (REFUND_FULL, current)
recommendations, each with their own `evidenceSnapshot`.

## 15. Example: Multi-Agent Investigation (Stage 1)

**Request**:
```bash
POST /api/cases/RT-001/investigate
{
  "policyCode": "CANCELLATION_FEE_SG",
  "actor": "system:orchestrator"
}
```

**Response** (200, `COMPLETED`):
```json
{
  "investigationId": "inv_1701234567890_a1b2c3",
  "caseCode": "RT-001",
  "status": "COMPLETED",
  "agents": {
    "riderAdvocate": {
      "status": "COMPLETED",
      "finding": {
        "agentRole": "RIDER_ADVOCATE",
        "party": "RIDER",
        "supportingPoints": [
          {
            "claim": "Rider was waiting at the designated pickup entrance",
            "citedEvidenceIds": ["cmv-rider-gps"],
            "note": "Rider GPS shows proximity to the pickup pin."
          }
        ],
        "weakeningPoints": [
          {
            "claim": "Rider GPS accuracy is poor (80m)",
            "citedEvidenceIds": ["cmv-rider-gps"],
            "note": "GPS accuracy exceeds 50m threshold, cannot pinpoint exact entrance."
          }
        ],
        "uncertaintyLevel": "MEDIUM",
        "summary": "The rider appears to have been at the designated pickup location, but GPS accuracy is insufficient to confirm the exact entrance. An independent geotag would resolve the ambiguity.",
        "unresolvedQuestions": [
          "Where exactly was the driver waiting relative to the designated entrance?"
        ]
      },
      "error": null,
      "toolCallsUsed": 4,
      "durationMs": 3200
    },
    "driverAdvocate": {
      "status": "COMPLETED",
      "finding": {
        "agentRole": "DRIVER_ADVOCATE",
        "party": "DRIVER",
        "supportingPoints": [
          {
            "claim": "Driver arrived and waited at the pickup area",
            "citedEvidenceIds": ["cmv-driver-gps"],
            "note": "Driver GPS shows presence near the pickup pin."
          }
        ],
        "weakeningPoints": [
          {
            "claim": "Driver GPS accuracy is poor (80m)",
            "citedEvidenceIds": ["cmv-driver-gps"],
            "note": "GPS accuracy exceeds 50m threshold, cannot confirm exact entrance."
          }
        ],
        "uncertaintyLevel": "MEDIUM",
        "summary": "The driver appears to have arrived at the general pickup area, but GPS accuracy is insufficient to confirm they were at the designated entrance. An independent geotag would clarify.",
        "unresolvedQuestions": [
          "Was the driver at the designated entrance or a different one?"
        ]
      },
      "error": null,
      "toolCallsUsed": 4,
      "durationMs": 3100
    },
    "neutralResolution": {
      "status": "COMPLETED",
      "finding": {
        "agreements": [
          {
            "point": "Both parties agree a cancellation fee was charged",
            "citedEvidenceIds": ["cmv-trip-telemetry"],
            "note": "The trip telemetry confirms a cancellation fee of SGD 5.00."
          }
        ],
        "disagreements": [
          {
            "point": "Whether the driver was at the designated entrance",
            "riderPosition": "Rider claims driver never arrived at Door 1",
            "driverPosition": "Driver claims they arrived and waited",
            "citedEvidenceIds": ["cmv-rider-gps", "cmv-driver-gps"],
            "note": "GPS data from both parties is too imprecise to resolve this."
          }
        ],
        "unresolvedQuestions": [
          "Where exactly was the driver waiting relative to the designated entrance?"
        ],
        "sufficiencyAssessment": "Evidence is insufficient — no independent geotag is available to confirm the pickup location.",
        "policyAssessment": "No policy rule can be applied because evidence is insufficient.",
        "recommendationExplanation": "Evidence is insufficient to make a determination. No independent geotag is available to confirm the pickup location. No policy rule is applied. The case requires additional evidence or human review.",
        "citedEvidenceIds": ["cmv-rider-gps", "cmv-driver-gps", "cmv-trip-telemetry"],
        "uncertaintyLevel": "HIGH"
      },
      "error": null,
      "toolCallsUsed": 0,
      "durationMs": 1500
    }
  },
  "evidenceSnapshot": [
    { "evidenceId": "cmv-rider-gps", "refGroup": "rider-gps", "type": "GPS_PING", "source": "RIDER_PHONE", "version": 1, "hash": "...", "capturedAt": "2026-10-12T14:31:00.000Z", "payload": { "..." : "..." } },
    { "evidenceId": "cmv-driver-gps", "refGroup": "driver-gps", "type": "GPS_PING", "source": "DRIVER_PHONE", "version": 1, "hash": "...", "capturedAt": "2026-10-12T14:31:30.000Z", "payload": { "..." : "..." } },
    { "evidenceId": "cmv-trip-chat", "refGroup": "trip-chat", "type": "CHAT_LOG", "source": "PLATFORM", "version": 1, "hash": "...", "capturedAt": "2026-10-12T14:30:00.000Z", "payload": { "..." : "..." } },
    { "evidenceId": "cmv-trip-telemetry", "refGroup": "trip-telemetry", "type": "TRIP_TELEMETRY", "source": "PLATFORM", "version": 1, "hash": "...", "capturedAt": "2026-10-12T14:32:00.000Z", "payload": { "..." : "..." } }
  ],
  "sufficiency": {
    "state": "INSUFFICIENT_EVIDENCE",
    "reasons": [
      "No independent geotag confirming the designated entrance and driver's actual location. GPS proximity alone cannot prove a claim.",
      "Rider GPS accuracy (80m) exceeds threshold (50m); rider GPS will not be used as sole proof of pickup location.",
      "Driver GPS accuracy (80m) exceeds threshold (50m); driver GPS will not be used as sole proof of pickup location."
    ],
    "missingRequirements": ["THIRD_PARTY_GEOTAG"]
  },
  "policyRecommendation": {
    "outcome": "INSUFFICIENT_EVIDENCE",
    "refundCents": 0,
    "matchedRuleId": null,
    "approvalState": "NOT_APPLICABLE",
    "rationale": "Evidence is INSUFFICIENT_EVIDENCE. No policy rule applied. Case requires additional evidence or human review. No conclusion is drawn about either party's claim.",
    "policyCode": "CANCELLATION_FEE_SG",
    "policyVersion": 2,
    "recommendationId": "cmv-investigation-rec"
  },
  "humanApprovalRequired": false,
  "escalationReason": null
}
```

**After submitting Stage 2 evidence and re-running investigation:**

```bash
POST /api/cases/RT-001/investigate
{ "policyCode": "CANCELLATION_FEE_SG", "actor": "system:orchestrator" }
```

The response will have:
- `status`: `"COMPLETED"`
- `evidenceSnapshot`: 5 entries (includes `third-party-geotag`)
- `sufficiency.state`: `"SUFFICIENT"`
- `policyRecommendation.outcome`: `"REFUND_FULL"`
- `policyRecommendation.refundCents`: `500`
- `policyRecommendation.approvalState`: `"PENDING"`
- `humanApprovalRequired`: `true`
- Agent findings will reference the geotag evidence in their `citedEvidenceIds`

The human approval gate is preserved — the refund is not executed until
`POST /api/cases/{id}/recommendations/{recId}/approve` is called with
`decision: "APPROVED"`.