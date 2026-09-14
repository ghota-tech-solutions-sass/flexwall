import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/site/Chrome";
import { SignInForm } from "@/components/site/SignInForm";
import { sessionUserId } from "@/presentation/http";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  if (await sessionUserId()) redirect("/edit");
  const { expired } = await searchParams;
  return (
    <div className="page">
      <TopBar signedIn={false} />
      <main className="auth">
        <h1>Sign in to Flexwall</h1>
        <p className="hint">No password. We email you a link that signs you in, and creates your account the first time.</p>
        {expired ? <p className="error">That link had expired. Ask for a new one.</p> : null}
        <SignInForm />
      </main>
    </div>
  );
}
