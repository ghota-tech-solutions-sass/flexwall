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

export const metadata: Metadata = { title: "Settings", robots: { index: false } };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ upgraded?: string }> }) {
  const userId = await sessionUserId();
  if (!userId) redirect("/login");
  const owner = await container().getOwnerWall.execute({ userId }).catch((e) => {
    if (e instanceof DomainError && e.code === "not_found") redirect("/onboarding");
    throw e;
  });
  const { upgraded } = await searchParams;
  const program = await container().getReferralProgram.execute({ userId });

  return (
    <div className="page">
      <TopBar signedIn />
      <main style={{ maxWidth: 720 }}>
        <p>
          <Link href="/edit" className="link">
            ← Back to the editor
          </Link>
        </p>
        <h1 style={{ letterSpacing: "-0.03em" }}>Settings</h1>
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
            Signed in as {owner.user.email}. Your wall: <Link href={`/@${owner.wall.handle}`}>flexwall.lol/@{owner.wall.handle}</Link>
          </p>
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="btn">
              Sign out
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
