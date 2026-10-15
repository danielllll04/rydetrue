import { NextRequest, NextResponse } from "next/server";
import { investigateRequestSchema } from "@/lib/schemas";
import { getProvider } from "@/lib/agents/provider";
import { investigateCase } from "@/lib/agents/orchestrator";

interface RouteParams {
  params: { id: string };
}
const activeCases = new Set<string>();

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
      { status: 400 },
    );
  }

  if (activeCases.has(caseCode))
    return NextResponse.json(
      { error: "investigation_in_progress" },
      { status: 409 },
    );
  activeCases.add(caseCode);
  try {
    // Only the explicit process mode selects a provider; credentials never opt in.
    const provider = getProvider();

    // --- Run the investigation ---
    const result = await investigateCase(
      caseCode,
      provider,
      body.policyCode,
      body.actor,
      { retryInvestigationId: body.retryInvestigationId },
    );

    // --- Return structured result ---
    const httpStatus =
      result.status === "FAILED"
        ? 422
        : result.status === "ESCALATED"
          ? 200 // Escalated is still a valid response — case needs human review
          : 200;

    return NextResponse.json(
      {
        ...result,
        ...(result.escalationReason?.includes("(retry_context_mismatch)")
          ? { error: "retry_context_mismatch" }
          : {}),
      },
      { status: httpStatus },
    );
  } finally {
    activeCases.delete(caseCode);
  }
}
