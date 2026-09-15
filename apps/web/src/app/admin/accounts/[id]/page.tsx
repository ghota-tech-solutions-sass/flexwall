import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AccountActions } from "@/components/admin/AccountActions";
import { CreditActions } from "@/components/admin/CreditActions";
import { TopBar } from "@/components/site/Chrome";
import { container } from "@/composition";
import { DomainError } from "@/domain/errors";
import { adminDate, PLAN_LABELS, PLAN_SOURCE_LABELS, stripeCustomerUrl } from "@/presentation/admin";
import { sessionUserId } from "@/presentation/http";
import { ROUTES } from "@/presentation/routes";

export const metadata: Metadata = { title: "Account", robots: { index: false } };

export default async function AdminAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await sessionUserId();
  if (!userId) redirect(ROUTES.login);
  const c = container();
  const account = await c.getAccount.execute({ userId, accountId: (await params).id }).catch((e) => {
    if (e instanceof DomainError && e.code === "not_found") notFound();
    throw e;
  });
  const s = account.subscription;
  const credits = await c.getCredits.execute({ userId: account.id });

  return (
    <div className="page">
      <TopBar signedIn />
      <main className="admin">
        <div className="settings-head">
          <Link href={ROUTES.admin} className="link">
            All accounts
          </Link>
          <h1 className="display admin-email">{account.email}</h1>
          <p className="hint">
            <span className={account.plan === "free" ? "badge" : "badge quiet"}>{PLAN_LABELS[account.plan]}</span> {PLAN_SOURCE_LABELS[account.source]} · joined {adminDate(account.createdAt)}
          </p>
        </div>

        <section className="panel" aria-labelledby="account">
          <h2 id="account">Account</h2>
          <dl className="admin-facts">
            <dt>Id</dt>
            <dd className="mono">{account.id}</dd>
            <dt>Handle</dt>
            <dd>{account.handle ? <Link href={ROUTES.wall(account.handle)}>@{account.handle}</Link> : "Not chosen yet"}</dd>
            <dt>Time zone</dt>
            <dd>{account.timeZone}</dd>
            <dt>Invited by</dt>
            <dd>{account.referredBy ? <Link href={ROUTES.adminAccount(account.referredBy)}>{account.referredBy}</Link> : "Nobody"}</dd>
          </dl>
        </section>

        <section className="panel" aria-labelledby="plan">
          <h2 id="plan">Plan</h2>
          <dl className="admin-facts">
            <dt>Subscription</dt>
            <dd>{s ? `${s.status}, ${s.interval === "year" ? "yearly" : "monthly"}, ${s.cancelAtPeriodEnd ? "ends" : "renews"} ${adminDate(s.currentPeriodEnd)}` : "None"}</dd>
            <dt>Lifetime</dt>
            <dd>{account.lifetime ? "Yes" : "No"}</dd>
            <dt>Referral rewards</dt>
            <dd>{account.bonusProUntil && account.bonusProUntil > Date.now() ? `Pro until ${adminDate(account.bonusProUntil)}` : "None running"}</dd>
            <dt>Stripe</dt>
            <dd>{account.stripeCustomerId ? <a href={stripeCustomerUrl(account.stripeCustomerId)}>{account.stripeCustomerId}</a> : "No customer"}</dd>
            <dt>Offered Pro</dt>
            <dd>
              {account.complimentary
                ? `${account.complimentary.until ? `Until ${adminDate(account.complimentary.until)}` : "With no end"}, by ${account.complimentary.grantedBy} on ${adminDate(account.complimentary.grantedAt)}${account.complimentary.note ? `: “${account.complimentary.note}”` : ""}`
                : "None"}
            </dd>
          </dl>
          <AccountActions accountId={account.id} hasOffer={Boolean(account.complimentary)} offerHasNoEnd={account.complimentary?.until === null} wall={account.wall ? { published: account.wall.published, listed: account.wall.listed } : null} section="plan" />
        </section>

        <section className="panel" aria-labelledby="credits">
          <h2 id="credits">Credits</h2>
          <dl className="admin-facts">
            <dt>Balance</dt>
            <dd>
              {credits.balance.toLocaleString()}
              {credits.daysLeft !== null ? ` · about ${credits.daysLeft} days at ${credits.perDay} a day` : ""}
            </dd>
            <dt>Spending</dt>
            <dd>{credits.metered.length ? credits.metered.map((m) => m.label).join(", ") : "Nothing"}</dd>
            <dt>Latest</dt>
            <dd>
              {credits.recent.length
                ? credits.recent
                    .slice(0, 4)
                    .map((e) => `${e.amount > 0 ? "+" : ""}${e.amount} ${e.reason} ${adminDate(e.at)}${e.detail ? ` (${e.detail})` : ""}`)
                    .join(" · ")
                : "No activity"}
            </dd>
          </dl>
          <CreditActions accountId={account.id} />
        </section>

        <section className="panel" aria-labelledby="wall">
          <h2 id="wall">Wall</h2>
          {account.wall ? (
            <>
              <dl className="admin-facts">
                <dt>Page</dt>
                <dd>
                  <Link href={ROUTES.wall(account.wall.handle)}>flexwall.lol/@{account.wall.handle}</Link> {account.wall.title ? `· ${account.wall.title}` : ""}
                </dd>
                <dt>Tiles</dt>
                <dd>{account.wall.tiles}</dd>
                <dt>Last edited</dt>
                <dd>{adminDate(account.wall.updatedAt)}</dd>
              </dl>
              <AccountActions accountId={account.id} hasOffer={Boolean(account.complimentary)} offerHasNoEnd={account.complimentary?.until === null} wall={{ published: account.wall.published, listed: account.wall.listed }} section="wall" />
            </>
          ) : (
            <p>No wall yet: the account hasn't finished choosing a handle.</p>
          )}
        </section>

        <section className="panel" aria-labelledby="connections">
          <h2 id="connections">Connections</h2>
          {account.connections.length ? (
            <ul className="conn-list">
              {account.connections.map((conn) => (
                <li key={conn.id}>
                  <span>
                    <strong>{c.catalog.connector(conn.connector)?.name ?? conn.connector}</strong> {conn.label}
                  </span>
                  <span className="hint">
                    since {adminDate(conn.createdAt)}
                    {conn.expiresAt ? ` · credentials until ${adminDate(conn.expiresAt)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>No accounts connected.</p>
          )}
        </section>
      </main>
    </div>
  );
}
