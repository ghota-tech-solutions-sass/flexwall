import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/site/Chrome";
import { BillingPanel } from "@/components/settings/BillingPanel";
import { ConnectionsManager } from "@/components/settings/ConnectionsManager";
import { CreditsPanel } from "@/components/settings/CreditsPanel";
import { ReferralPanel } from "@/components/settings/ReferralPanel";
import { tilesUsing } from "@/application/editor/draft";
import { usesCredits } from "@/application/use-cases/credits";
import { container } from "@/composition";
import { DomainError } from "@/domain/errors";
import { catalog } from "@/plugins/registry";
import { sessionUserId } from "@/presentation/http";
import { API, CREDITS_ANCHOR, ROUTES, SETTINGS_PARAMS } from "@/presentation/routes";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Partial<Record<(typeof SETTINGS_PARAMS)[keyof typeof SETTINGS_PARAMS], string>>> }) {
  const userId = await sessionUserId();
  if (!userId) redirect(ROUTES.login);
  const owner = await container().getOwnerWall.execute({ userId }).catch((e) => {
    if (e instanceof DomainError && e.code === "not_found") redirect(ROUTES.onboarding);
    throw e;
  });
  const query = await searchParams;
  const upgraded = query[SETTINGS_PARAMS.upgraded];
  const credits = await container().getCredits.execute({ userId });
  // Credits only concern owners of accounts Flexwall reads with its own paid key; for everyone else the section isn't there.
  const showCredits = usesCredits(credits) || Boolean(query[SETTINGS_PARAMS.credits]);
  const program = await container().getReferralProgram.execute({ userId });
  const administrator = await container().isAdministrator.execute({ userId });
  const now = Date.now();
  const offer = owner.user.complimentary;
  // From the saved wall: what each account feeds on the public page.
  const usage = Object.fromEntries(owner.connections.map((c) => [c.id, tilesUsing(c.id, owner.wall.tiles, catalog)]));

  return (
    <div className="page">
      <TopBar signedIn />
      <main style={{ maxWidth: 1000 }}>
        <div className="settings-head">
          <div className="row">
            <Link href={ROUTES.edit} className="link">
              Back to the editor
            </Link>
            {administrator ? (
              <Link href={ROUTES.admin} className="link">
                Accounts
              </Link>
            ) : null}
          </div>
          <h1 className="display">Settings</h1>
          <nav className="settings-nav" aria-label="Settings sections">
            <a href="#billing">Plan</a>
            {showCredits ? <a href={`#${CREDITS_ANCHOR}`}>Credits</a> : null}
            <a href="#connections">Connections</a>
            {program ? <a href="#invite">Invite friends</a> : null}
            <a href="#account">Account</a>
          </nav>
        </div>
        {upgraded ? <p className="hint">Payment received. Pro turns on as soon as Stripe confirms, usually within a few seconds.</p> : null}
        <BillingPanel
          entitlements={owner.entitlements}
          paidPlan={owner.paidPlan}
          bonusProUntil={owner.user.bonusProUntil ?? null}
          offeredUntil={offer && (offer.until === null || offer.until > now) ? offer.until : undefined}
          subscription={owner.user.subscription}
          hasCustomer={Boolean(owner.user.stripeCustomerId)}
        />
        {showCredits ? <CreditsPanel view={credits} justBought={Boolean(query[SETTINGS_PARAMS.credits])} /> : null}
        <ConnectionsManager initial={owner.connections} paid={owner.entitlements.paid} usage={usage} now={now} />
        {program ? <ReferralPanel program={program} /> : null}
        <section className="panel" aria-labelledby="account">
          <h2 id="account">Account</h2>
          <p>
            Signed in as {owner.user.email}. Your wall: <Link href={ROUTES.wall(owner.wall.handle)}>flexwall.lol/@{owner.wall.handle}</Link>
          </p>
          <form action={API.signOut} method="post">
            <button type="submit" className="btn">
              Sign out
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
