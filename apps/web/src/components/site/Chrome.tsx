import Link from "next/link";
import { LEGAL_PATHS } from "@/components/legal/LegalDocument";
import { PUBLISHER } from "@/domain/publisher";
import { SOURCE_URL } from "@/site";

/** The wall mark: one wide tile and two small ones, as on a lock screen. */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="currentColor" />
      <rect x="12" y="12" width="40" height="18" rx="5" fill="#2fb866" />
      <rect x="12" y="34" width="18" height="18" rx="5" fill="var(--bg)" />
      <rect x="34" y="34" width="18" height="18" rx="5" fill="var(--muted)" />
    </svg>
  );
}

export function TopBar({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="brand" aria-label="Flexwall home">
          <Logo />
          Flexwall
        </Link>
        <nav className="nav" aria-label="Main">
          <Link href="/explore" className="hide-sm">
            The Wall
          </Link>
          <Link href="/integrations" className="hide-sm">
            Integrations
          </Link>
          <Link href="/pricing" className="hide-sm">
            Pricing
          </Link>
          {SOURCE_URL ? (
            <a href={SOURCE_URL} className="hide-sm">
              GitHub
            </a>
          ) : null}
        </nav>
        <div className="nav-actions">
          {signedIn ? (
            <Link href="/edit" className="btn btn-signal btn-small">
              Edit my wall
            </Link>
          ) : (
            <>
              <Link href="/login" className="nav-link">
                Sign in
              </Link>
              <Link href="/login" className="btn btn-signal btn-small">
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
        <Link href="/" className="brand">
          <Logo />
          Flexwall
        </Link>
        <p>Your real numbers, live on one page and on your lock screen.</p>
      </div>
      <nav aria-label="Product">
        <h2>Product</h2>
        <Link href="/explore">The Wall</Link>
        <Link href="/integrations">Integrations</Link>
        <Link href="/pricing">Pricing</Link>
        {SOURCE_URL ? <a href={`${SOURCE_URL}/tree/main/docs`}>Docs</a> : null}
      </nav>
      <nav aria-label="Legal">
        <h2>Legal</h2>
        <Link href={LEGAL_PATHS.terms.en}>Terms</Link>
        <Link href={LEGAL_PATHS.privacy.en}>Privacy</Link>
        <Link href={LEGAL_PATHS.notice.en}>Legal notice</Link>
        <Link href={LEGAL_PATHS.terms.fr}>CGV (français)</Link>
      </nav>
      <nav aria-label="Contact">
        <h2>Contact</h2>
        {PUBLISHER.contactEmail ? <a href={`mailto:${PUBLISHER.contactEmail}`}>{PUBLISHER.contactEmail}</a> : null}
        {PUBLISHER.registeredAddress ? <span>{PUBLISHER.registeredAddress.split(",").slice(-2).join(",").trim()}</span> : null}
      </nav>
      <p className="footer-legal">
        © {new Date().getFullYear()} {PUBLISHER.companyName}. {SOURCE_URL ? "Flexwall is open source (AGPL-3.0). Plugins and SDK are MIT." : "Prices in US dollars, taxes included."}
      </p>
    </footer>
  );
}
