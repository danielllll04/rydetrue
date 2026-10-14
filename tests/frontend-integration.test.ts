import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../src/lib/db";
import { GET as listCases } from "../src/app/api/cases/route";
import { GET as getCase } from "../src/app/api/cases/[id]/route";
import { GET as getPolicies } from "../src/app/api/policies/route";
import { POST as submitEvidence } from "../src/app/api/cases/[id]/evidence/route";
import { POST as investigate } from "../src/app/api/cases/[id]/investigate/route";
import { POST as evaluate } from "../src/app/api/cases/[id]/evaluate/route";
import { POST as approve } from "../src/app/api/cases/[id]/recommendations/[recId]/approve/route";
import {
  RT_001_TRIP,
  RT_001_DISPUTE,
  RT_001_RIDER_STATEMENT,
  RT_001_DRIVER_STATEMENT,
  RT_001_STAGE_1_EVIDENCE_BY_GROUP,
  RT_001_STAGE_2_GEOTAG,
} from "../src/lib/cases";
import { hashPayload } from "../src/lib/evidence";
import { ApiError, createApiClient } from "../src/frontend/lib/api-client";
import {
  agentViews,
  canReview,
  currentInvestigation,
  isSnapshotCurrent,
  resolveCitationId,
} from "../src/frontend/lib/view-model";
import type { SubmitEvidenceRequest } from "../src/lib/schemas";

// Exercise the real HTTP serialization and production route handlers through
// the frontend transport seam. Prisma points to a disposable test DB via setup.
const transport = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input), "http://localhost");
  const request = new NextRequest(url, {
    ...init,
    signal: init?.signal || undefined,
  });
  const match = url.pathname.match(/^\/api\/cases\/([^/]+)(?:\/(.*))?$/);
  if (url.pathname === "/api/cases") return listCases(request);
  if (url.pathname === "/api/policies") return getPolicies(request);
  if (!match)
    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
    });
  const id = decodeURIComponent(match[1]);
  const tail = match[2];
  if (!tail) return getCase(request, { params: { id } });
  if (tail === "evidence") return submitEvidence(request, { params: { id } });
  if (tail === "evaluate") return evaluate(request, { params: { id } });
  if (tail === "investigate") return investigate(request, { params: { id } });
  const recId = tail.match(/^recommendations\/([^/]+)\/approve$/)?.[1];
  if (recId)
    return approve(request, {
      params: { id, recId: decodeURIComponent(recId) },
    });
  return new Response("{}", { status: 404 });
};
const api = createApiClient(transport);
const caseCode = `RT-INTEGRATION-${Date.now()}`;
const geotag: SubmitEvidenceRequest = {
  ...RT_001_STAGE_2_GEOTAG,
  actor: "reviewer:integration-test",
  notes: "Explicit synthetic test submission",
};

describe.sequential("Frontend client against canonical backend APIs", () => {
  beforeAll(async () => {
    const trip = await prisma.trip.create({
      data: { ...RT_001_TRIP, caseCode },
    });
    const dispute = await prisma.dispute.create({
      data: { ...RT_001_DISPUTE, caseCode, tripId: trip.id },
    });
    for (const statement of [RT_001_RIDER_STATEMENT, RT_001_DRIVER_STATEMENT])
      await prisma.statement.create({
        data: { ...statement, disputeId: dispute.id },
      });
    for (const evidence of Object.values(RT_001_STAGE_1_EVIDENCE_BY_GROUP))
      await prisma.evidence.create({
        data: {
          disputeId: dispute.id,
          type: evidence.type,
          source: evidence.source,
          refGroup: evidence.refGroup,
          capturedAt: new Date(evidence.capturedAt),
          payload: JSON.stringify(evidence.payload),
          hash: hashPayload(evidence.payload),
        },
      });
  });
  it("retrieves and validates persisted cases, details and policy versions", async () => {
    expect((await api.listCases()).some((c) => c.caseCode === caseCode)).toBe(
      true,
    );
    const detail = await api.getCase(caseCode);
    expect(detail.currentRecommendation).toBeNull();
    expect(detail.statements.map((s) => s.role)).toContain("RIDER");
    expect(detail.evidence.integrity.every((e) => e.hashMatches)).toBe(true);
    expect(
      (await api.listPolicies()).some(
        (p) => p.code === "CANCELLATION_FEE_SG" && p.version === 2,
      ),
    ).toBe(true);
  });
  it("connects the deterministic evaluate endpoint without inventing agent findings", async () => {
    const result = await api.evaluate(caseCode, "CANCELLATION_FEE_SG");
    expect(result.recommendation.outcome).toBe("INSUFFICIENT_EVIDENCE");
    const detail = await api.getCase(caseCode);
    expect(agentViews(detail).every((a) => a.status === "NOT_RUN")).toBe(true);
    expect(canReview(detail)).toBe(false);
  });
  it("runs the initial mock investigation with insufficient evidence and no approval", async () => {
    const result = await api.investigate(caseCode, "CANCELLATION_FEE_SG");
    expect(result.status).toBe("COMPLETED");
    expect(result.policyRecommendation.outcome).toBe("INSUFFICIENT_EVIDENCE");
    const detail = await api.getCase(caseCode);
    expect(currentInvestigation(detail).provider).toBe("mock");
    expect(agentViews(detail).every((a) => a.status === "COMPLETED")).toBe(
      true,
    );
    expect(canReview(detail)).toBe(false);
    expect(detail.currentRecommendation?.approvalState).toBe("NOT_APPLICABLE");
  });
  it("persists explicit third-party evidence and marks the old snapshot stale", async () => {
    const result = await api.submitEvidence(caseCode, geotag);
    expect(result.evidence.version).toBe(1);
    const detail = await api.getCase(caseCode);
    expect(
      detail.evidence.groups.some((e) => e.type === "THIRD_PARTY_GEOTAG"),
    ).toBe(true);
    expect(isSnapshotCurrent(detail)).toBe(false);
    expect(canReview(detail)).toBe(false);
    expect(detail.status).toBe("REOPENED");
  });
  it("reinvestigates to REFUND_FULL SGD 5.00, with validated citations and preserved history", async () => {
    const result = await api.investigate(caseCode, "CANCELLATION_FEE_SG");
    expect(result.policyRecommendation.outcome).toBe("REFUND_FULL");
    expect(result.policyRecommendation.refundCents).toBe(500);
    expect(result.policyRecommendation.approvalState).toBe("PENDING");
    const detail = await api.getCase(caseCode);
    expect(detail.recommendationHistory).toHaveLength(3);
    expect(detail.recommendationHistory[0].outcome).toBe(
      "INSUFFICIENT_EVIDENCE",
    );
    expect(detail.status).toBe("AWAITING_APPROVAL");
    expect(canReview(detail)).toBe(true);
    const ids = new Set(detail.evidence.integrity.map((e) => e.id));
    expect(
      agentViews(detail).every((a) => a.refs.every((id) => ids.has(id))),
    ).toBe(true);
    expect(
      detail.currentRecommendation?.evidenceSnapshot.some(
        (e) => e.refGroup === "third-party-geotag",
      ),
    ).toBe(true);
    const rec = detail.currentRecommendation!;
    const geotagId = rec.evidenceSnapshot.find(
      (e) => e.refGroup === "third-party-geotag",
    )!.evidenceId;
    expect(resolveCitationId("third-party-geotag", rec)).toBe(geotagId);
    expect(resolveCitationId("policy", rec)).toBe("policy");
    expect(resolveCitationId("trip", rec)).toBe("trip");
  });
  it("requires an explicit approval call and retrieves the persisted human decision on reload", async () => {
    const before = await api.getCase(caseCode);
    const recId = before.currentRecommendation!.id;
    expect(before.currentRecommendation?.approvalState).toBe("PENDING");
    const result = await api.approve(caseCode, recId, {
      decision: "APPROVED",
      actor: "reviewer:integration-test",
      notes: "Evidence reviewed; explicit simulated approval.",
    });
    expect(result.recommendation.simulated).toBe(true);
    const reloaded = await createApiClient(transport).getCase(caseCode);
    expect(reloaded.currentRecommendation?.approvalState).toBe("APPROVED");
    expect(reloaded.status).toBe("APPROVED");
    expect(reloaded.audit.some((a) => a.action === "APPROVE")).toBe(true);
    await expect(
      api.approve(caseCode, recId, {
        decision: "APPROVED",
        actor: "reviewer:integration-test",
      }),
    ).rejects.toMatchObject({ status: 409, code: "already_actioned" });
  });
  it("blocks stale snapshots in the UI and persists an explicit rejection of a fresh recommendation", async () => {
    await api.evaluate(caseCode, "CANCELLATION_FEE_SG");
    await api.submitEvidence(caseCode, geotag);
    const stale = await api.getCase(caseCode);
    expect(canReview(stale)).toBe(false);
    expect(
      stale.evidence.groups
        .find((g) => g.refGroup === "third-party-geotag")
        ?.historyVersions.slice()
        .sort(),
    ).toEqual([1, 2]);
    await api.investigate(caseCode, "CANCELLATION_FEE_SG");
    const fresh = await api.getCase(caseCode);
    await api.approve(caseCode, fresh.currentRecommendation!.id, {
      decision: "REJECTED",
      actor: "reviewer:integration-test",
      notes: "Explicit rejection workflow validation.",
    });
    const rejected = await api.getCase(caseCode);
    expect(rejected.status).toBe("REJECTED");
    expect(rejected.currentRecommendation?.approvalState).toBe("REJECTED");
  });
  it("surfaces API failures instead of a mock success or fixture fallback", async () => {
    await expect(api.getCase("UNKNOWN-CASE")).rejects.toMatchObject({
      status: 404,
      code: "case_not_found",
    });
    await expect(
      api.submitEvidence(caseCode, { ...geotag, payload: {} }),
    ).rejects.toMatchObject({ status: 400, code: "invalid_evidence_payload" });
    const malformed = createApiClient(
      async () => new Response("{}", { status: 200 }),
    );
    await expect(malformed.getCase(caseCode)).rejects.toMatchObject({
      code: "contract_mismatch",
    });
    let attempts = 0;
    const unavailable = createApiClient(async () => {
      attempts++;
      throw new Error("offline");
    });
    await expect(
      unavailable.submitEvidence(caseCode, geotag),
    ).rejects.toBeInstanceOf(ApiError);
    expect(attempts).toBe(1);
  });
});
