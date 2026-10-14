import type { Metadata } from "next";
import "@/frontend/workspace.css";
export const metadata: Metadata = {
  title: "RydeTRUE · Connected workspace",
  description:
    "Evidence-led dispute resolution with persisted synthetic data. Unofficial hackathon concept.",
};
export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
