import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/site/Chrome";
import { SignInForm } from "@/components/site/SignInForm";
import { container } from "@/composition";
import { Handle } from "@/domain/handle";
import { sessionUserId } from "@/presentation/http";
import { LOGIN_PARAMS, ROUTES } from "@/presentation/routes";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Partial<Record<(typeof LOGIN_PARAMS)[keyof typeof LOGIN_PARAMS], string>>> }) {
  // Only a session for an account that still exists skips sign-in; otherwise /edit would send it straight back here.
  const userId = await sessionUserId();
  if (userId && (await container().users.byId(userId))) redirect(ROUTES.edit);
  const params = await searchParams;
  const expired = params[LOGIN_PARAMS.expired];
  const wanted = params[LOGIN_PARAMS.handle];
  const handle = wanted && Handle.isValid(wanted) ? Handle.parse(wanted) : undefined;
  return (
    <div className="page">
      <TopBar signedIn={false} />
      <main className="auth">
        <h1>{handle ? `Claim flexwall.lol/@${handle}` : "Sign in to Flexwall"}</h1>
        <p className="hint">No password. We email you a link that signs you in, and creates your account the first time.</p>
        {handle ? <p className="hint">The handle follows you into the link, so you won&apos;t type it again.</p> : null}
        {expired ? <p className="error">That link had expired. Ask for a new one.</p> : null}
        <SignInForm handle={handle} />
      </main>
    </div>
  );
}
