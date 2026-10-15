import { withDemoSession } from "@/lib/public-demo";
import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { prisma } from "@/lib/db";

async function handleGET(_req: NextRequest) {
  const disputes = await prisma.dispute.findMany({
    include: {
      trip: true,
      recommendations: {
        where: { supersededById: null },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { openedAt: "desc" },
  });
  return NextResponse.json({
    cases: disputes.map((d) => ({
      caseCode: d.caseCode,
      category: d.category,
      status: d.status,
      openedAt: d.openedAt,
      city: d.trip.city,
      cancellationFeeCents: d.trip.cancellationFeeCents,
      hasRecommendation: d.recommendations.length > 0,
      recommendationOutcome: d.recommendations[0]?.outcome ?? null,
      recommendationCount: d.recommendations.length,
    })),
  });
}

export async function GET(req: NextRequest) {
  return withDemoSession(req, request => handleGET(request));
}
