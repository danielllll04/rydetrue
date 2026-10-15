import { NextRequest } from "next/server";
import { demoSession } from "@/lib/public-demo";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  return demoSession(req);
}
