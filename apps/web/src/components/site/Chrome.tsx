import Link from "next/link";
import { LEGAL_PATHS } from "@/components/legal/LegalDocument";
import { PUBLISHER } from "@/domain/publisher";
import { ROUTES } from "@/presentation/routes";
import { SOURCE_URL } from "@/site";
import { Logo } from "@/components/brand/Logo";

export { Logo };

export function TopBar({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href={ROUTES.home} className="brand" aria-label="Flexwall home">
          <Logo />
          Flexwall
        </Link>
        <nav className="nav" aria-label="Main">
          <Link href={ROUTES.demo}>Try the demo</Link>
          <Link href={ROUTES.explore} className="hide-sm">
            The Wall
          </Link>
          <Link href={ROUTES.integrations} className="hide-sm">
            Integrations
          </Link>
          <Link href={ROUTES.pricing} className="hide-sm">
            Pricing
          </Link>
          {SOURCE_URL ? (
            <a href={SOURCE_URL} className="hide-sm">
              GitHub
            </a>
          ) : null}
        </nav>
        <div className="nav-actions">
          <details className="mobile-menu">
            <summary aria-label="Navigation menu">Menu</summary>
            <nav aria-label="Mobile navigation">
              <Link href={ROUTES.demo}>Try the demo</Link>
              <Link href={ROUTES.pricing}>Pricing</Link>
              <Link href={ROUTES.explore}>The Wall</Link>
              <Link href={ROUTES.integrations}>Integrations</Link>
              <Link href={signedIn ? ROUTES.edit : ROUTES.login}>{signedIn ? "Edit my wall" : "Sign in"}</Link>
            </nav>
          </details>
          {signedIn ? (
            <Link href={ROUTES.edit} className="btn btn-signal btn-small">
              Edit my wall
            </Link>
          ) : (
            <>
              <Link href={ROUTES.login} className="nav-link">
                Sign in
              </Link>
              <Link href={ROUTES.login} className="btn btn-signal btn-small">
                Claim your wall
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-brand">
        <Link href={ROUTES.home} className="brand">
          <Logo />
          Flexwall
        </Link>
        <p>Your real numbers, live on one page and on your lock screen.</p>
      </div>
      <nav aria-label="Product">
        <h2>Product</h2>
        <Link href={ROUTES.demo}>Try the demo</Link>
        <Link href={ROUTES.explore}>The Wall</Link>
        <Link href={ROUTES.wall("flexwall")}>Our live wall</Link>
        <Link href={ROUTES.integrations}>Integrations</Link>
        <Link href={ROUTES.pricing}>Pricing</Link>
        {SOURCE_URL ? <a href={`${SOURCE_URL}/tree/main/docs`}>Docs</a> : null}
      </nav>
      <nav aria-label="Legal">
        <h2>Legal</h2>
        <Link href={LEGAL_PATHS.terms.en}>Terms</Link>
        <Link href={LEGAL_PATHS.privacy.en}>Privacy</Link>
        <Link href={LEGAL_PATHS.notice.en}>Legal notice</Link>
      </nav>
      <p className="footer-legal">
        © {new Date().getFullYear()} {PUBLISHER.companyName}. {SOURCE_URL ? "Flexwall is open source (AGPL-3.0). Plugins and SDK are MIT." : "Prices in US dollars, taxes included."}
      </p>
    </footer>
  );
}
