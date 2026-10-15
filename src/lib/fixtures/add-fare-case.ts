import type { PrismaClient } from "@prisma/client";
import {
  RT_002_CASE_CODE,
  RT_002_TRIP,
  RT_002_STATEMENTS,
  RT_002_STAGE_1,
  RT_002_POLICY,
} from "../fare-case";
import { evidencePayloadSchema } from "../schemas";
import { hashPayload } from "../evidence";

/** Additive only. Callers must explicitly supply a disposable QA client. */
export async function addFareCase(
  client: PrismaClient,
  caseCode = RT_002_CASE_CODE,
) {
  return client.$transaction(async (tx) => {
    const existing = await tx.dispute.findUnique({ where: { caseCode } });
    if (existing) return existing;
    const rules = {
      rules: RT_002_POLICY.rules,
      fallback: RT_002_POLICY.fallback,
    };
    const stored = await tx.policyVersion.findUnique({
      where: {
        code_version: {
          code: RT_002_POLICY.code,
          version: RT_002_POLICY.version,
        },
      },
    });
    if (stored && hashPayload(JSON.parse(stored.rules)) !== hashPayload(rules))
      throw new Error("fare_fixture_policy_conflict");
    if (!stored)
      await tx.policyVersion.create({
        data: {
          code: RT_002_POLICY.code,
          version: RT_002_POLICY.version,
          description: RT_002_POLICY.description,
          effectiveFrom: new Date("2026-01-01T00:00:00Z"),
          rules: JSON.stringify(rules),
        },
      });
    const trip = await tx.trip.create({ data: { ...RT_002_TRIP, caseCode } });
    const dispute = await tx.dispute.create({
      data: {
        caseCode,
        tripId: trip.id,
        category: "FARE_DISCREPANCY",
        status: "OPEN",
        summary:
          "Synthetic completed-trip fare discrepancy: accepted quote versus charged amount and permitted extras.",
      },
    });
    await tx.statement.createMany({
      data: RT_002_STATEMENTS.map((s) => ({ ...s, disputeId: dispute.id })),
    });
    for (const record of RT_002_STAGE_1) {
      const payload = evidencePayloadSchema.parse({
        ...record.payload,
        ...(record.payload.type.startsWith("FARE_") ? { caseCode } : {}),
      });
      await tx.evidence.create({
        data: {
          disputeId: dispute.id,
          refGroup: record.refGroup,
          source: record.source,
          type: payload.type,
          version: 1,
          capturedAt: new Date(record.capturedAt),
          payload: JSON.stringify(payload),
          hash: hashPayload(payload),
          notes:
            "Fictional fare reconciliation fixture; not an external billing record.",
        },
      });
    }
    await tx.auditEvent.create({
      data: {
        disputeId: dispute.id,
        action: "OPEN",
        actor: "system:synthetic-fare-fixture",
        payload: JSON.stringify({
          category: "FARE_DISCREPANCY",
          synthetic: true,
          reason:
            "Completed-trip charge disputed; pricing authorization evidence initially missing.",
        }),
      },
    });
    return dispute;
  });
}
