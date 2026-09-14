import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/site/Chrome";
import { BillingPanel } from "@/components/settings/BillingPanel";
import { ConnectionsManager } from "@/components/settings/ConnectionsManager";
import { ReferralPanel } from "@/components/settings/ReferralPanel";
import { container } from "@/composition";
import { DomainError } from "@/domain/errors";
import { sessionUserId } from "@/presentation/http";
import { API, ROUTES, SETTINGS_PARAMS } from "@/presentation/routes";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Partial<Record<(typeof SETTINGS_PARAMS)["upgraded"], string>>> }) {
  const userId = await sessionUserId();
  if (!userId) redirect(ROUTES.login);
  const owner = await container().getOwnerWall.execute({ userId }).catch((e) => {
    if (e instanceof DomainError && e.code === "not_found") redirect(ROUTES.onboarding);
    throw e;
  });
  const upgraded = (await searchParams)[SETTINGS_PARAMS.upgraded];
  const program = await container().getReferralProgram.execute({ userId });

  return (
    <div className="page">
      <TopBar signedIn />
      <main style={{ maxWidth: 1000 }}>
        <div className="settings-head">
          <Link href={ROUTES.edit} className="link">
            Back to the editor
          </Link>
          <h1 className="display">Settings</h1>
        </div>
        {upgraded ? <p className="hint">Payment received. Pro turns on as soon as Stripe confirms, usually within a few seconds.</p> : null}
        <BillingPanel
          entitlements={owner.entitlements}
          paidPlan={owner.paidPlan}
          bonusProUntil={owner.user.bonusProUntil ?? null}
          subscription={owner.user.subscription}
          hasCustomer={Boolean(owner.user.stripeCustomerId)}
        />
        {program ? <ReferralPanel program={program} /> : null}
        <ConnectionsManager initial={owner.connections} paid={owner.entitlements.paid} />
        <section className="panel">
          <h2>Account</h2>
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
