import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/site/Chrome";
import { HandleForm } from "@/components/site/HandleForm";
import { container } from "@/composition";
import { sessionUserId } from "@/presentation/http";

export const metadata: Metadata = { title: "Pick your handle", robots: { index: false } };

export default async function OnboardingPage() {
  const userId = await sessionUserId();
  if (!userId) redirect("/login");
  const user = await container().users.byId(userId);
  if (!user) redirect("/login");
  if (user.handle) redirect("/edit");
  return (
    <div className="page">
      <TopBar signedIn />
      <main className="auth">
        <h1>Pick your handle</h1>
        <p className="hint">Your wall will live at flexwall.lol/@handle. You can&apos;t change it later, so pick one you&apos;ll keep.</p>
        <HandleForm />
      </main>
    </div>
  );
}
