import type { CaseDetail } from "../lib/api-types";
import { farePresentation, isFareCase } from "../lib/fare-presentation";
import { money } from "../lib/view-model";
import { Badge, Panel, SectionTitle } from "./ui";

export function FareReconciliation({ detail }: { detail: CaseDetail }) {
  if (!isFareCase(detail)) return null;
  const { quote, receipt, sufficiency, metrics } = farePresentation(detail);
  return (
    <Panel className="fare-reconciliation">
      <SectionTitle
        extra={
          <Badge tone={metrics ? "green" : "amber"}>
            {metrics ? "Pricing reconciled" : "Pricing unresolved"}
          </Badge>
        }
      >
        Fare reconciliation
      </SectionTitle>
      <p className="quiet small">
        Current synthetic pricing records · fixed accepted quote and explicitly
        permitted extras. GPS or route length does not authorize an extra
        charge.
      </p>
      <dl className="fare-amounts">
        <div>
          <dt>Accepted quote</dt>
          <dd>{quote ? money(quote.quotedCents) : "Unavailable"}</dd>
        </div>
        <div>
          <dt>Actual charge</dt>
          <dd>{receipt ? money(receipt.chargedCents) : "Unavailable"}</dd>
        </div>
        <div>
          <dt>Verified permitted extras</dt>
          <dd>
            {metrics ? money(metrics.permittedExtrasCents) : "Not established"}
          </dd>
        </div>
        <div>
          <dt>Allowed total</dt>
          <dd>{metrics ? money(metrics.allowedCents) : "Not established"}</dd>
        </div>
        <div>
          <dt>Evidenced excess</dt>
          <dd>{metrics ? money(metrics.excessCents) : "Not established"}</dd>
        </div>
      </dl>
      {receipt && (
        <div className="fare-line-items">
          <strong>Charged extras</strong>
          {receipt.extras.length ? (
            receipt.extras.map((extra) => (
              <p key={extra.id}>
                {extra.description}
                <span>{money(extra.amountCents)}</span>
              </p>
            ))
          ) : (
            <p>No extras on the receipt.</p>
          )}
        </div>
      )}
      <p className="quiet small">{sufficiency.reasons.join(" ")}</p>
      <p className="quiet small">
        Amounts are computed in integer cents. Any refund remains a separate
        persisted recommendation and simulated human decision.
      </p>
    </Panel>
  );
}
