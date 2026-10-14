import { NextRequest, NextResponse } from "next/server";
import { investigateRequestSchema } from "@/lib/schemas";
import { getProvider } from "@/lib/agents/provider";
import { investigateCase } from "@/lib/agents/orchestrator";

interface RouteParams {
  params: { id: string };
}

/**
 * POST /api/cases/[id]/investigate
 *
 * Runs a full multi-agent investigation:
 *  1. Rider Advocate — investigates the rider's claim
 *  2. Driver Advocate — investigates the driver's claim
 *  3. Neutral Resolution — explains the deterministic recommendation
 *
 * The deterministic sufficiency checker and policy engine run independently
 * of the agents. The agent outputs are advisory — they cannot override the
 * deterministic policy outcome or approve refunds.
 *
 * Response includes:
 *  - Investigation ID
 *  - Agent execution statuses and findings
 *  - Evidence snapshot references
 *  - Sufficiency state
 *  - Deterministic policy recommendation
 *  - Human approval requirement
 *  - Error or escalation status
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const caseCode = params.id;

  // --- Validate request body ---
  let body;
  try {
    body = investigateRequestSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "invalid_request", details: (err as Error).message },
      { status: 400 }
    );
  }

  // --- Get the configured LLM provider ---
  // In test mode (VITEST or NODE_ENV=test) without an API key, this returns
  // a MockProvider. In production with RYDETRUE_LLM_API_KEY set, this returns
  // a TencentCloudProvider. In production without an API key, the provider
  // will throw NOT_CONFIGURED and the investigation escalates to human review.
  const provider = getProvider();

  // --- Run the investigation ---
  const result = await investigateCase(
    caseCode,
    provider,
    body.policyCode,
    body.actor
  );

  // --- Return structured result ---
  const httpStatus =
    result.status === "FAILED"
      ? 422
      : result.status === "ESCALATED"
        ? 200 // Escalated is still a valid response — case needs human review
        : 200;

  return NextResponse.json(result, { status: httpStatus });
}
