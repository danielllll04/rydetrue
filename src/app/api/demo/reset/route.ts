import { NextRequest } from "next/server";
import { demoSession } from "@/lib/public-demo";
export async function POST(req: NextRequest) {
  return demoSession(req, true);
}
