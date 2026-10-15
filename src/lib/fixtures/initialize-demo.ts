import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import {
  RT_001_TRIP,
  RT_001_DISPUTE,
  RT_001_RIDER_STATEMENT,
  RT_001_DRIVER_STATEMENT,
  RT_001_STAGE_1_EVIDENCE_BY_GROUP,
  RT_001_POLICY,
  RT_001_POLICY_V1,
} from "../cases";
import { hashPayload } from "../evidence";
import { addFareCase } from "./add-fare-case";

/** Only for a caller-supplied, newly created empty disposable database. */
export async function initializeDemo(client: PrismaClient) {
  const sql = await readFile(path.resolve("prisma/demo-schema.sql"), "utf8");
  for (const statement of sql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean))
    await client.$executeRawUnsafe(statement);
  await client.$transaction(async (tx) => {
    for (const policy of [RT_001_POLICY_V1, RT_001_POLICY]) {
      await tx.policyVersion.create({
        data: {
          code: policy.code,
          version: policy.version,
          description: policy.description,
          effectiveFrom: new Date(
            policy.version === 1
              ? "2026-01-01T00:00:00Z"
              : "2026-07-01T00:00:00Z",
          ),
          effectiveTo:
            policy.version === 1 ? new Date("2026-06-30T23:59:59Z") : null,
          rules: JSON.stringify({
            rules: policy.rules,
            fallback: policy.fallback,
          }),
        },
      });
    }
    const trip = await tx.trip.create({ data: RT_001_TRIP });
    const dispute = await tx.dispute.create({
      data: { ...RT_001_DISPUTE, tripId: trip.id },
    });
    for (const statement of [RT_001_RIDER_STATEMENT, RT_001_DRIVER_STATEMENT])
      await tx.statement.create({
        data: {
          role: statement.role,
          authorAlias: statement.authorAlias,
          text: statement.text,
          disputeId: dispute.id,
        },
      });
    for (const [refGroup, record] of Object.entries(
      RT_001_STAGE_1_EVIDENCE_BY_GROUP,
    ))
      await tx.evidence.create({
        data: {
          disputeId: dispute.id,
          type: record.type,
          source: record.source,
          refGroup,
          version: 1,
          hash: hashPayload(record.payload),
          capturedAt: new Date(record.capturedAt),
          payload: JSON.stringify(record.payload),
          notes: `Synthetic Stage 1 fixture (${refGroup})`,
        },
      });
    await tx.auditEvent.create({
      data: {
        disputeId: dispute.id,
        actor: "system:synthetic-demo",
        action: "OPEN",
        payload: JSON.stringify({
          synthetic: true,
          reason:
            "Rider disputes a synthetic cancellation fee at Changi Airport T3.",
        }),
      },
    });
  });
  await addFareCase(client);
}
