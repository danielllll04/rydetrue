/** Compact JSON sections without removing evidence, claims, or string content. */
export function compactNeutralContext(content: string): string {
  return content.replace(
    /(=== [A-Z ]+ ===\n)([\s\S]*?)(?=\n=== [A-Z ]+ ===\n|$)/g,
    (whole, header, json) => {
      try {
        return header + JSON.stringify(JSON.parse(json.trim())) + "\n";
      } catch {
        return whole;
      }
    },
  );
}
