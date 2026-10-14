/**
 * Seeds the SQLite database with RT-001 (Stage 1 evidence only) and two
 * policy versions. Idempotent: re-running clears RT-001 rows first.
 *
 * Stage 2 evidence (THIRD_PARTY_GEOTAG) is NOT seeded — it is submitted via
 * the POST /api/cases/[id]/evidence endpoint during the re-evaluation demo.
 */

import { PrismaClient } from "@prisma/client";
import {
  RT_001_CASE_CODE,
  RT_001_TRIP,
  RT_001_DISPUTE,
  RT_001_RIDER_STATEMENT,
  RT_001_DRIVER_STATEMENT,
  RT_001_STAGE_1_EVIDENCE_BY_GROUP,
  RT_001_POLICY,
  RT_001_POLICY_V1,
} from "../src/lib/cases";
import { hashPayload, verifyHash } from "../src/lib/evidence";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding RydeTRUE demo data (RT-001 Stage 1 only)...");

  // 1. Policy versions (v1 deprecated, v2 active).
  await prisma.policyVersion.upsert({
    where: {
      code_version: { code: RT_001_POLICY_V1.code, version: RT_001_POLICY_V1.version },
    },
    update: {},
    create: {
      code: RT_001_POLICY_V1.code,
      version: RT_001_POLICY_V1.version,
      description: RT_001_POLICY_V1.description,
      effectiveFrom: new Date("2026-01-01T00:00:00Z"),
      effectiveTo: new Date("2026-06-30T23:59:59Z"),
      rules: JSON.stringify({
        rules: RT_001_POLICY_V1.rules,
        fallback: RT_001_POLICY_V1.fallback,
      }),
    },
  });

  await prisma.policyVersion.upsert({
    where: {
      code_version: { code: RT_001_POLICY.code, version: RT_001_POLICY.version },
    },
    update: {},
    create: {
      code: RT_001_POLICY.code,
      version: RT_001_POLICY.version,
      description: RT_001_POLICY.description,
      effectiveFrom: new Date("2026-07-01T00:00:00Z"),
      effectiveTo: null,
      rules: JSON.stringify({
        rules: RT_001_POLICY.rules,
        fallback: RT_001_POLICY.fallback,
      }),
    },
  });

  // 2. Wipe existing RT-001 rows so the seed is idempotent.
  await prisma.auditEvent.deleteMany({
    where: { dispute: { caseCode: RT_001_CASE_CODE } },
  });
  await prisma.recommendation.deleteMany({
    where: { dispute: { caseCode: RT_001_CASE_CODE } },
  });
  await prisma.agentFinding.deleteMany({
    where: { dispute: { caseCode: RT_001_CASE_CODE } },
  });
  await prisma.evidence.deleteMany({
    where: { dispute: { caseCode: RT_001_CASE_CODE } },
  });
  await prisma.statement.deleteMany({
    where: { dispute: { caseCode: RT_001_CASE_CODE } },
  });
  await prisma.dispute.deleteMany({ where: { caseCode: RT_001_CASE_CODE } });
  await prisma.trip.deleteMany({ where: { caseCode: RT_001_CASE_CODE } });

  // 3. Trip + Dispute.
  const trip = await prisma.trip.create({ data: RT_001_TRIP });

  const dispute = await prisma.dispute.create({
    data: {
      ...RT_001_DISPUTE,
      tripId: trip.id,
    },
  });

  // 4. Statements.
  await prisma.statement.create({
    data: {
      disputeId: dispute.id,
      role: RT_001_RIDER_STATEMENT.role,
      authorAlias: RT_001_RIDER_STATEMENT.authorAlias,
      text: RT_001_RIDER_STATEMENT.text,
    },
  });
  await prisma.statement.create({
    data: {
      disputeId: dispute.id,
      role: RT_001_DRIVER_STATEMENT.role,
      authorAlias: RT_001_DRIVER_STATEMENT.authorAlias,
      text: RT_001_DRIVER_STATEMENT.text,
    },
  });

  // 5. Stage 1 Evidence (with version + hash).
  // NOTE: Stage 2 evidence (THIRD_PARTY_GEOTAG) is NOT seeded here.
  // It is submitted via the POST /api/cases/[id]/evidence endpoint.
  for (const [refGroup, e] of Object.entries(RT_001_STAGE_1_EVIDENCE_BY_GROUP)) {
    const payload = e.payload;
    const hash = hashPayload(payload);
    await prisma.evidence.create({
      data: {
        disputeId: dispute.id,
        type: e.type,
        source: e.source,
        refGroup,
        version: 1,
        hash,
        capturedAt: new Date(e.capturedAt),
        payload: JSON.stringify(payload),
        notes: `Synthetic Stage 1 fixture (${refGroup})`,
      },
    });
  }

  // 6. Open audit event.
  await prisma.auditEvent.create({
    data: {
      disputeId: dispute.id,
      actor: "system",
      action: "OPEN",
      payload: JSON.stringify({
        reason: "Rider disputed cancellation fee of SGD 5.00 at Changi Airport T3.",
        openedAt: dispute.openedAt.toISOString(),
      }),
    },
  });

  // 7. Quick integrity check: verify hashes.
  const evidenceRecords = await prisma.evidence.findMany({
    where: { disputeId: dispute.id },
  });
  let ok = 0;
  let bad = 0;
  for (const r of evidenceRecords) {
    if (verifyHash(r)) ok++;
    else bad++;
  }

  console.log(
    `Seed complete. Trip ${trip.caseCode}, dispute ${dispute.id}. ` +
      `Stage 1 evidence: ${evidenceRecords.length} records, ${ok} hash-verified, ${bad} bad. ` +
      `Stage 2 evidence (THIRD_PARTY_GEOTAG) not seeded — submit via API.`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());