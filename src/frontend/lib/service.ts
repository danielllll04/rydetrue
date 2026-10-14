import { cases, investigations } from "./fixtures";
import type { CaseService, Submission } from "./types";
export function validateSubmission(value: Submission): string | null {
  if (value.statement.trim().length < 20)
    return "Please add at least 20 characters to help us understand what happened.";
  if (value.statement.length > 3000)
    return "Keep your statement under 3,000 characters.";
  if (value.files.length > 5) return "Add up to 5 files.";
  if (
    value.files.some(
      (file) =>
        file.size > 10 * 1024 * 1024 ||
        !["image/jpeg", "image/png", "application/pdf"].includes(file.type),
    )
  )
    return "Use JPG, PNG or PDF files, up to 10 MB each.";
  return null;
}
/** In-memory fixture adapter. No HTTP requests or invented backend routes. */
export function createDemoService(delayMs = 550, fail = false): CaseService {
  const wait = async () => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    if (fail)
      throw new Error(
        "The demo service is temporarily unavailable. Please retry.",
      );
  };
  return {
    async listCases() {
      await wait();
      return structuredClone(cases);
    },
    async getInvestigation(stage) {
      await wait();
      return structuredClone(investigations[stage]);
    },
    async submit(role, submission) {
      const error = validateSubmission(submission);
      if (error) throw new Error(error);
      await wait();
      return { reference: role === "rider" ? "RT-001" : "RT-001-DR" };
    },
    async review(decision, stage) {
      if (decision === "approved" && stage !== "reinvestigation")
        throw new Error(
          "Additional evidence is required before approving this recommendation.",
        );
      await wait();
      return { decision };
    },
  };
}
export const caseService = createDemoService();
