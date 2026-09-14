import Link from "next/link";

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
        <a href="https://github.com/ghota-tech-solutions-sass/flexwall" className="hide-sm">
          GitHub
        </a>
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
      <span>Flexwall is open source (AGPL-3.0). Plugins and SDK are MIT.</span>
      <nav aria-label="Footer">
        <Link href="/explore">The Wall</Link>
        <Link href="/pricing">Pricing</Link>
        <a href="https://github.com/ghota-tech-solutions-sass/flexwall/tree/main/docs">Docs</a>
        <Link href="/legal">Terms &amp; privacy</Link>
      </nav>
    </footer>
  );
}
