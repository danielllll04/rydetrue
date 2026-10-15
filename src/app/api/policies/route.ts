import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { prisma } from "@/lib/db";

export async function GET(_req: NextRequest) {
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
