import { ConnectedApp } from "@/frontend/components/connected-app";
import { selectedProviderMode } from "@/lib/agents/provider-mode";
export const dynamic = "force-dynamic";
export default function WorkspacePage() {
  const selected = selectedProviderMode();
  const mode =
    selected === "mock"
      ? "mock"
      : selected === "groq" && process.env.RYDETRUE_LLM_API_KEY?.trim()
        ? "groq"
        : "unconfigured";
  return (
    <ConnectedApp
      providerMode={mode}
      publicDemo={process.env.RYDETRUE_PUBLIC_DEMO === "true"}
    />
  );
}
