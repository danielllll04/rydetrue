import { withDemoSession } from "@/lib/public-demo";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { submitEvidenceRequestSchema, evidencePayloadSchema } from "@/lib/schemas";
import { hashPayload } from "@/lib/evidence";
import { FARE_EVIDENCE_TYPES } from "@/lib/fare-contracts";

interface RouteParams {
  params: Promise<{ id: string }> | { id: string };
}

/**
 * POST /api/cases/[id]/evidence
 *
 * Submit additional synthetic evidence to an existing dispute. Creates a new
 * evidence row (new version for an existing refGroup, or version 1 for a new
 * refGroup). Old evidence is preserved — never overwritten.
 *
 * The payload is validated against the Zod evidence payload schema. The hash
 * is computed over the canonical JSON of the payload for chain-of-custody.
 */
async function handlePOST(req: NextRequest, { params }: RouteParams) {
  const caseCode = (await params).id;

  let body;
  try {
    body = submitEvidenceRequestSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "invalid_request", details: (err as Error).message },
      { status: 400 }
    );
  }

  const dispute = await prisma.dispute.findFirst({
    where: { caseCode },
    include: { evidence: true },
  });
  if (!dispute) {
    return NextResponse.json({ error: "case_not_found", caseCode }, { status: 404 });
  }

  // Validate payload against the evidence payload schema.
  let validatedPayload;
  try {
    validatedPayload = evidencePayloadSchema.parse(body.payload);
  } catch (err) {
    return NextResponse.json(
      {
        error: "invalid_evidence_payload",
        details: (err as Error).message,
        evidenceType: body.type,
      },
      { status: 400 }
    );
  }

  if (validatedPayload.type !== body.type)
    return NextResponse.json({ error: "evidence_type_mismatch" }, { status: 400 });
  if (FARE_EVIDENCE_TYPES.some(type => type === validatedPayload.type)) {
    const payload = validatedPayload as import("@/lib/fare-contracts").FareEvidence;
    const source = payload.type === "FARE_ADJUSTMENT_RECORD" ? "THIRD_PARTY" : "PLATFORM";
    if (dispute.category !== "FARE_DISCREPANCY" || payload.caseCode !== caseCode || body.source !== source)
      return NextResponse.json({ error: "fare_evidence_scope_or_source_mismatch" }, { status: 400 });
  }
  if (dispute.evidence.some(e => e.refGroup === body.refGroup && (e.type !== body.type || e.source !== body.source)))
    return NextResponse.json({ error: "evidence_group_identity_mismatch" }, { status: 400 });

  // Compute hash over canonical JSON of the validated payload.
  const hash = hashPayload(validatedPayload);
  const payloadJson = JSON.stringify(validatedPayload);

  // Determine the next version number for this refGroup.
  const existing = dispute.evidence.filter((e) => e.refGroup === body.refGroup);
  const nextVersion = existing.length > 0 ? Math.max(...existing.map((e) => e.version)) + 1 : 1;

  // Create the new evidence row.
  const evidence = await prisma.evidence.create({
    data: {
      disputeId: dispute.id,
      type: body.type,
      source: body.source,
      refGroup: body.refGroup,
      version: nextVersion,
      hash,
      capturedAt: new Date(body.capturedAt),
      payload: payloadJson,
      notes: body.notes ?? `Submitted via API by ${body.actor}`,
    },
  });

  // Create audit event.
  await prisma.auditEvent.create({
    data: {
      disputeId: dispute.id,
      actor: body.actor,
      action: "SUBMIT_EVIDENCE",
      payload: JSON.stringify({
        evidenceId: evidence.id,
        refGroup: body.refGroup,
        version: nextVersion,
        type: body.type,
        source: body.source,
        hash,
      }),
    },
  });

  // If the case was PENDING_REVIEW, reopen it for investigation.
  if (dispute.status === "PENDING_REVIEW") {
    await prisma.dispute.update({
      where: { id: dispute.id },
      data: { status: "REOPENED" },
    });
    await prisma.auditEvent.create({
      data: {
        disputeId: dispute.id,
        actor: "system",
        action: "REOPEN",
        payload: JSON.stringify({
          reason: "New evidence submitted; case reopened for investigation.",
          evidenceId: evidence.id,
        }),
      },
    });
  }

  return NextResponse.json(
    {
      caseCode,
      evidence: {
        id: evidence.id,
        type: evidence.type,
        source: evidence.source,
        refGroup: evidence.refGroup,
        version: evidence.version,
        hash: evidence.hash,
        capturedAt: evidence.capturedAt,
        notes: evidence.notes,
      },
    },
    { status: 201 }
  );
}

export function POST(req: NextRequest, context: RouteParams): Promise<NextResponse>;
export function POST(req: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse>;
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> | { id: string } }) {
  return withDemoSession(req, request => handlePOST(request, context));
}
