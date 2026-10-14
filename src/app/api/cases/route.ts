import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(_req: NextRequest) {
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