import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ConnectorAvailabilityForm } from "@/components/admin/ConnectorAvailabilityForm";
import { TopBar } from "@/components/site/Chrome";
import { container } from "@/composition";
import { DomainError } from "@/domain/errors";
import { adminDate, AVAILABILITY_LABELS, overrideLine } from "@/presentation/admin";
import { sessionUserId } from "@/presentation/http";
import { ROUTES } from "@/presentation/routes";

export const metadata: Metadata = { title: "Connectors", robots: { index: false } };

export default async function AdminConnectorsPage() {
  const userId = await sessionUserId();
  if (!userId) redirect(ROUTES.login);
  const connectors = await container()
    .getConnectorControls.execute({ userId })
    .catch((e) => {
      if (e instanceof DomainError && e.code === "not_found") notFound();
      throw e;
    });
  const sandboxed = connectors.filter((c) => c.override === "sandbox").length;

  return (
    <div className="page">
      <TopBar signedIn />
      <main className="admin">
        <div className="settings-head">
          <div className="row">
            <Link href={ROUTES.admin} className="link">
              Accounts
            </Link>
            <Link href={ROUTES.settings} className="link">
              Back to settings
            </Link>
          </div>
          <h1 className="display">Connectors</h1>
          <p className="hint">
            {connectors.length} connectors
            {sandboxed ? `, ${sandboxed} still on a provider's sandbox and kept to administrators` : ", all on production credentials"}.
          </p>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Connector</th>
                <th scope="col">Server</th>
                <th scope="col">In use</th>
                <th scope="col">Who may use it</th>
              </tr>
            </thead>
            <tbody>
              {connectors.map((c) => {
                const reason = overrideLine(c.override);
                return (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.name}</strong>
                      <div className="hint mono">{c.id}</div>
                    </td>
                    <td>
                      {c.status ? (
                        <>
                          <span className={c.status.environment === "sandbox" || !c.status.configured ? "badge" : "badge quiet"}>
                            {!c.status.configured ? "Not configured" : c.status.environment === "sandbox" ? "Sandbox" : "Production"}
                          </span>
                          {c.status.detail ? <div className="hint">{c.status.detail}</div> : null}
                        </>
                      ) : (
                        <span className="hint">Needs nothing from the server</span>
                      )}
                    </td>
                    <td>
                      {c.connections} {c.connections === 1 ? "account" : "accounts"}
                      <div className="hint">{c.tier === "pro" ? "Pro" : "Free"}</div>
                    </td>
                    <td>
                      <ConnectorAvailabilityForm connectorId={c.id} chosen={c.chosen} locked={c.override !== null} />
                      <div className="hint">
                        In force: {AVAILABILITY_LABELS[c.effective]}
                        {reason ? ` · ${reason}` : ""}
                        {c.changedBy ? ` · ${c.changedBy}, ${adminDate(c.changedAt)}` : ""}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
