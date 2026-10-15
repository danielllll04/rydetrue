import { withDemoSession } from "@/lib/public-demo";
import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { prisma } from "@/lib/db";

async function handleGET(_req: NextRequest) {
  const policies = await prisma.policyVersion.findMany({
    orderBy: [{ code: "asc" }, { version: "desc" }],
  });
  return NextResponse.json({
    policies: policies.map((p) => ({
      id: p.id,
      code: p.code,
      version: p.version,
      description: p.description,
      effectiveFrom: p.effectiveFrom,
      effectiveTo: p.effectiveTo,
      rules: JSON.parse(p.rules),
    })),
  });
}

export async function GET(req: NextRequest) {
  return withDemoSession(req, request => handleGET(request));
}
