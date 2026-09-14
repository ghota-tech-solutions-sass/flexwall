import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/site/Chrome";
import { SignInForm } from "@/components/site/SignInForm";
import { container } from "@/composition";
import { sessionUserId } from "@/presentation/http";
import { LOGIN_PARAMS, ROUTES } from "@/presentation/routes";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Partial<Record<(typeof LOGIN_PARAMS)["expired"], string>>> }) {
  // Only a session for an account that still exists skips sign-in; otherwise /edit would send it straight back here.
  const userId = await sessionUserId();
  if (userId && (await container().users.byId(userId))) redirect(ROUTES.edit);
  const expired = (await searchParams)[LOGIN_PARAMS.expired];
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
