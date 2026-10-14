import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <span className="text-2xl font-bold">
            <span className="text-rydePink">ryde</span>
            <span className="text-ink">TRUE</span>
            <span className="ml-1 inline-block rounded-full bg-rydePink text-white text-xs align-middle px-1.5">
              M1
            </span>
          </span>
          <p className="mt-1 text-ink-soft text-sm">
            Two sides. One fair resolution.
          </p>
        </div>

        <h1 className="text-3xl font-semibold mb-2">
          Evidence-led dispute resolution — Milestone 1
        </h1>
        <p className="text-ink-soft mb-6">
          Deterministic data model, evidence retrieval, GPS verification, policy
          evaluation and APIs. AI agents and dashboard arrive in M2.
        </p>

        <div className="rounded-xl border border-rydePink-100 bg-rydePink-50 p-5 mb-8">
          <p className="text-sm text-ink">
            <strong>Demo case:</strong> RT-001 — Singapore cancellation-fee
            dispute over the pickup location. All data is synthetic.
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <Link
              href="/api/cases/RT-001"
              className="rounded-lg bg-rydePink px-3 py-2 text-white hover:bg-rydePink-600"
            >
              View RT-001 case detail
            </Link>
            <Link
              href="/api/cases"
              className="rounded-lg border border-rydePink px-3 py-2 text-rydePink hover:bg-rydePink-50"
            >
              List all cases
            </Link>
            <Link
              href="/api/policies"
              className="rounded-lg border border-ink-soft px-3 py-2 text-ink-soft hover:bg-gray-50"
            >
              List policy versions
            </Link>
          </div>
        </div>

        <section className="space-y-2 text-sm text-ink-soft">
          <h2 className="text-base font-semibold text-ink">In this milestone</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Database models: Trip, Dispute, Statement, Evidence, AgentFinding, PolicyVersion, Recommendation, AuditEvent.</li>
            <li>Synthetic Singapore case RT-001 seeded.</li>
            <li>Haversine GPS distance; evidence versioning + hash chain-of-custody.</li>
            <li>Deterministic policy evaluator with citations.</li>
            <li>API routes: <code>/api/cases</code>, <code>/api/cases/[id]</code>, <code>/api/cases/[id]/evaluate</code>, <code>/api/policies</code>.</li>
            <li>Vitest unit + API tests.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}