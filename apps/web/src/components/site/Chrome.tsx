import Link from "next/link";
import { SOURCE_URL } from "@/site";

export function TopBar({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="topbar">
      <Link href="/" className="brand">
        flexwall<span>.lol</span>
      </Link>
      <nav className="nav" aria-label="Main">
        <Link href="/explore">The Wall</Link>
        <Link href="/pricing" className="hide-sm">
          Pricing
        </Link>
        {SOURCE_URL ? (
          <a href={SOURCE_URL} className="hide-sm">
            GitHub
          </a>
        ) : null}
        {signedIn ? (
          <Link href="/edit" className="btn btn-signal btn-small">
            Edit my wall
          </Link>
        ) : (
          <Link href="/login" className="btn btn-signal btn-small">
            Sign in
          </Link>
        )}
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <span>{SOURCE_URL ? "Flexwall is open source (AGPL-3.0). Plugins and SDK are MIT." : "Flexwall: your numbers, live, on one page."}</span>
      <nav aria-label="Footer">
        <Link href="/explore">The Wall</Link>
        <Link href="/pricing">Pricing</Link>
        <Link href="/integrations">Integrations</Link>
        {SOURCE_URL ? <a href={`${SOURCE_URL}/tree/main/docs`}>Docs</a> : null}
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/legal">Legal notice</Link>
      </nav>
    </footer>
  );
}
