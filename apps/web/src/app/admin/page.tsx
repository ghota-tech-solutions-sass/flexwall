import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TopBar } from "@/components/site/Chrome";
import { container } from "@/composition";
import { DomainError } from "@/domain/errors";
import { adminDate, adminSource, PLAN_LABELS, PLAN_SOURCE_LABELS, SOURCE_FILTERS } from "@/presentation/admin";
import { sessionUserId } from "@/presentation/http";
import { ROUTES } from "@/presentation/routes";

export const metadata: Metadata = { title: "Accounts", robots: { index: false } };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ q?: string; source?: string }> }) {
  const userId = await sessionUserId();
  if (!userId) redirect(ROUTES.login);
  const { q = "", source: rawSource } = await searchParams;
  const source = adminSource(rawSource);
  const result = await container()
    .listAccounts.execute({ userId, query: q, source })
    .catch((e) => {
      if (e instanceof DomainError && e.code === "not_found") notFound();
      throw e;
    });

  return (
    <div className="page">
      <TopBar signedIn />
      <main className="admin">
        <div className="settings-head">
          <Link href={ROUTES.settings} className="link">
            Back to settings
          </Link>
          <h1 className="display">Accounts</h1>
          <p className="hint">
            {result.accounts.length} shown of {result.total}
            {result.truncated ? ", the most the back office reads at once" : ""}.
          </p>
        </div>
        <form className="admin-filters" action={ROUTES.admin} method="get" role="search">
          <label className="field">
            <span>Search</span>
            <input name="q" type="search" defaultValue={q} placeholder="Email, @handle or account id" />
          </label>
          <label className="field">
            <span>Plan</span>
            <select name="source" defaultValue={source}>
              {SOURCE_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn btn-small">
            Filter
          </button>
        </form>
        {result.accounts.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Account</th>
                  <th scope="col">Wall</th>
                  <th scope="col">Plan</th>
                  <th scope="col">Joined</th>
                </tr>
              </thead>
              <tbody>
                {result.accounts.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link href={ROUTES.adminAccount(a.id)}>{a.email}</Link>
                    </td>
                    <td>{a.handle ? <Link href={ROUTES.wall(a.handle)}>@{a.handle}</Link> : <span className="hint">No handle yet</span>}</td>
                    <td>
                      <span className={a.plan === "free" ? "badge" : "badge quiet"}>{PLAN_LABELS[a.plan]}</span>{" "}
                      {a.source !== "free" ? <small className="hint">{PLAN_SOURCE_LABELS[a.source]}{a.source === "complimentary" ? ` · ${a.complimentaryUntil ? `until ${adminDate(a.complimentaryUntil)}` : "no end"}` : ""}</small> : null}
                    </td>
                    <td className="mono">{adminDate(a.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="hint">No account matches.</p>
        )}
      </main>
    </div>
  );
}
