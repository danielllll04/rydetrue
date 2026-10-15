import { describe, it, expect } from "vitest";
import { prisma } from "../src/lib/db";
import { addFareCase } from "../src/lib/fixtures/add-fare-case";
import { RT_002_STAGE_2 } from "../src/lib/fare-case";
import { GET } from "../src/app/api/cases/[id]/route";
import { POST } from "../src/app/api/cases/[id]/evidence/route";
import { caseDetailSchema } from "../src/frontend/lib/api-types";
import {
  farePresentation,
  caseAmountCents,
} from "../src/frontend/lib/fare-presentation";
import {
  investigationJourney,
  evidenceLabel,
  canReview,
} from "../src/frontend/lib/view-model";
import {
  resolutionTitle,
  resolutionHistory,
} from "../src/frontend/lib/resolution-presentation";
import { investigateCase } from "../src/lib/agents/orchestrator";
import { MockProvider } from "../src/lib/agents/providers/mock";
const code = "FARE-UI";
async function read() {
  return caseDetailSchema.parse(
    await (await GET({} as never, { params: { id: code } })).json(),
  );
}
describe("fare presentation from persisted backend records", () => {
  it("shows charged fare and unknown excess before the required pricing audit", async () => {
    await addFareCase(prisma, code);
    const detail = await read(),
      view = farePresentation(detail);
    expect(caseAmountCents(detail)).toBe(2900);
    expect(view.quote?.quotedCents).toBe(2000);
    expect(view.receipt?.chargedCents).toBe(2900);
    expect(view.metrics).toBeNull();
    expect(view.sufficiency.missingRequirements).toContain(
      "FARE_ADJUSTMENT_RECORD",
    );
    expect(investigationJourney(detail)[1].description).toBe(
      "Pricing audit not yet recorded",
    );
    expect(canReview(detail)).toBe(false);
  });
  it("shows the initial insufficient assessment without inventing an outcome", async () => {
    await investigateCase(
      code,
      new MockProvider(),
      "FARE_RECONCILIATION_SG",
      "test",
    );
    const detail = await read();
    expect(resolutionTitle(detail.currentRecommendation!)).toBe(
      "More evidence needed",
    );
    expect(investigationJourney(detail)[0].complete).toBe(true);
    expect(canReview(detail)).toBe(false);
  });
  it("shows new pricing evidence while keeping the prior recommendation stale", async () => {
    await POST(
      {
        json: async () => ({
          ...RT_002_STAGE_2,
          payload: { ...RT_002_STAGE_2.payload, caseCode: code },
          actor: "test",
        }),
      } as never,
      { params: { id: code } },
    );
    const detail = await read();
    expect(farePresentation(detail).metrics).toMatchObject({
      quotedCents: 2000,
      permittedExtrasCents: 300,
      allowedCents: 2300,
      excessCents: 600,
    });
    expect(detail.currentRecommendation!.outcome).toBe("INSUFFICIENT_EVIDENCE");
    expect(canReview(detail)).toBe(false);
    expect(investigationJourney(detail)[2].description).toBe(
      "New evidence awaits investigation",
    );
  });
  it("derives before/after history and human approval wording from actual records", async () => {
    await investigateCase(
      code,
      new MockProvider(),
      "FARE_RECONCILIATION_SG",
      "test",
    );
    const detail = await read(),
      before = structuredClone(detail);
    const history = resolutionHistory(detail);
    expect(history[0].item.outcome).toBe("INSUFFICIENT_EVIDENCE");
    expect(history[1].additions[0].type).toBe("FARE_ADJUSTMENT_RECORD");
    expect(history[1].additions[0].submittedAt).toBeDefined();
    expect(evidenceLabel(detail, history[1].additions[0].evidenceId)).toBe(
      "Permitted-extras audit · v1",
    );
    expect(resolutionTitle(detail.currentRecommendation!)).toBe(
      "Partial refund pending approval — S$6.00",
    );
    expect(canReview(detail)).toBe(true);
    farePresentation(detail);
    investigationJourney(detail);
    expect(detail).toEqual(before);
  });
  it("does not calculate from unverifiable pricing evidence", async () => {
    const detail = await read();
    detail.evidence.integrity = detail.evidence.integrity.map((e) => ({
      ...e,
      hashMatches: false,
    }));
    expect(farePresentation(detail).metrics).toBeNull();
    expect(canReview(detail)).toBe(false);
  });
  it("keeps cancellation fee displays unchanged", async () => {
    const detail = caseDetailSchema.parse(
      await (await GET({} as never, { params: { id: "RT-001" } })).json(),
    );
    expect(caseAmountCents(detail)).toBe(detail.trip.cancellationFeeCents);
    expect(investigationJourney(detail)[1].description).toMatch(/geotag/i);
  });
});
