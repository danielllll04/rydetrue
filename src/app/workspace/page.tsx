import { ConnectedApp } from "@/frontend/components/connected-app";
export const dynamic = "force-dynamic";
export default function WorkspacePage() {
  const mode =
    process.env.VITEST === "true" && !process.env.RYDETRUE_LLM_API_KEY
      ? "mock"
      : process.env.RYDETRUE_LLM_API_KEY
        ? "configured"
        : "unconfigured";
  return <ConnectedApp providerMode={mode} />;
}
