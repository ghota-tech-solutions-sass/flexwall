import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/site/Chrome";
import { HandleForm } from "@/components/site/HandleForm";
import { container } from "@/composition";
import { sessionUserId } from "@/presentation/http";
import { ONBOARDING_PARAMS, ROUTES } from "@/presentation/routes";

export const metadata: Metadata = { title: "Pick your handle", robots: { index: false } };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Partial<Record<(typeof ONBOARDING_PARAMS)["handle"], string>>> }) {
  const userId = await sessionUserId();
  if (!userId) redirect(ROUTES.login);
  const user = await container().users.byId(userId);
  if (!user) redirect(ROUTES.login);
  if (user.handle) redirect(ROUTES.edit);
  // What they typed before signing in. It is still confirmed here: a handle can't be changed afterwards.
  const wanted = (await searchParams)[ONBOARDING_PARAMS.handle];
  return (
    <div className="page">
      <TopBar signedIn />
      <main className="auth">
        <h1>Pick your handle</h1>
        <p className="hint">Your wall will live at flexwall.lol/@handle. You can&apos;t change it later, so pick one you&apos;ll keep.</p>
        <HandleForm suggested={wanted} />
      </main>
    </div>
  );
}
