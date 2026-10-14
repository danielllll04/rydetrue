import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  groupLatestByRefGroup,
  hashPayload,
  verifyHash,
} from "@/lib/evidence";

interface RouteParams {
  params: { id: string };
}

/**
 * GET /api/cases/[id]
 *
 * Returns the full case detail: trip, statements, evidence (grouped + latest
 * version + hash integrity), findings, recommendation history (all
 * recommendations including superseded ones), and audit log.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const caseCode = params.id;
  const dispute = await prisma.dispute.findFirst({
    where: { caseCode },
    include: {
      trip: true,
      statements: true,
      evidence: true,
      findings: true,
      recommendations: {
        include: { policyVersion: true },
        orderBy: { createdAt: "asc" },
      },
      audit: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!dispute) {
    return NextResponse.json({ error: "case_not_found", caseCode }, { status: 404 });
  }

  const grouped = groupLatestByRefGroup(dispute.evidence);

  // Hash-integrity check on every evidence record.
  const evidenceIntegrity = dispute.evidence.map((e) => ({
    id: e.id,
    refGroup: e.refGroup,
    type: e.type,
    version: e.version,
    hashMatches: verifyHash(e),
    recomputedHash: hashPayload(JSON.parse(e.payload)),
  }));

  // Identify the current recommendation (supersededById is null).
  const currentRec = dispute.recommendations.find((r) => r.supersededById === null);
  const history = dispute.recommendations;

  return NextResponse.json({
    caseCode: dispute.caseCode,
    category: dispute.category,
    status: dispute.status,
    summary: dispute.summary,
    openedAt: dispute.openedAt,
    closedAt: dispute.closedAt,
    trip: {
      caseCode: dispute.trip.caseCode,
      city: dispute.trip.city,
      status: dispute.trip.status,
      requestedAt: dispute.trip.requestedAt,
      acceptedAt: dispute.trip.acceptedAt,
      cancelledAt: dispute.trip.cancelledAt,
      pickup: {
        label: dispute.trip.pickupLabel,
        lat: dispute.trip.pickupLat,
        lng: dispute.trip.pickupLng,
      },
      dropoff: {
        label: dispute.trip.dropoffLabel,
        lat: dispute.trip.dropoffLat,
        lng: dispute.trip.dropoffLng,
      },
      fareAmountCents: dispute.trip.fareAmountCents,
      currency: dispute.trip.currency,
      cancellationFeeCents: dispute.trip.cancellationFeeCents,
    },
    statements: dispute.statements.map((s) => ({
      id: s.id,
      role: s.role,
      authorAlias: s.authorAlias,
      text: s.text,
      submittedAt: s.submittedAt,
    })),
    evidence: {
      groups: grouped.map((g) => ({
        refGroup: g.refGroup,
        type: g.type,
        source: g.source,
        latestVersion: g.latest.version,
        latestCapturedAt: g.latest.capturedAt,
        latestHash: g.latest.hash,
        historyVersions: g.history.map((h) => h.version),
        payload: g.latest.payload,
      })),
      integrity: evidenceIntegrity,
    },
    findings: dispute.findings.map((f) => ({
      id: f.id,
      agent: f.agent,
      summary: f.summary,
      payload: JSON.parse(f.payload),
      createdAt: f.createdAt,
    })),
    recommendationHistory: history.map((r) => ({
      id: r.id,
      outcome: r.outcome,
      sufficiencyState: r.sufficiencyState,
      refundCents: r.refundCents,
      rationale: r.rationale,
      citations: JSON.parse(r.citations),
      evidenceSnapshot: JSON.parse(r.evidenceSnapshot),
      approvalState: r.approvalState,
      approvedBy: r.approvedBy,
      approvedAt: r.approvedAt,
      policyCode: r.policyVersion.code,
      policyVersion: r.policyVersion.version,
      supersededById: r.supersededById,
      isCurrent: r.supersededById === null,
      createdAt: r.createdAt,
    })),
    currentRecommendation: currentRec
      ? {
          id: currentRec.id,
          outcome: currentRec.outcome,
          sufficiencyState: currentRec.sufficiencyState,
          refundCents: currentRec.refundCents,
          rationale: currentRec.rationale,
          citations: JSON.parse(currentRec.citations),
          evidenceSnapshot: JSON.parse(currentRec.evidenceSnapshot),
          approvalState: currentRec.approvalState,
          approvedBy: currentRec.approvedBy,
          approvedAt: currentRec.approvedAt,
          policyCode: currentRec.policyVersion.code,
          policyVersion: currentRec.policyVersion.version,
          createdAt: currentRec.createdAt,
        }
      : null,
    audit: dispute.audit.map((a) => ({
      id: a.id,
      actor: a.actor,
      action: a.action,
      payload: JSON.parse(a.payload),
      createdAt: a.createdAt,
    })),
  });
}