import Link from "next/link";

export function TopBar({ cta = true }: { cta?: boolean }) {
  return (
    <header className="topbar">
      <Link href="/" className="brand">
        flexwall<span>.lol</span>
      </Link>
      <nav className="topnav" aria-label="Main">
        <Link href="/setup" className="hide-sm">
          Setup guide
        </Link>
        <Link href="/wall">Gallery</Link>
        {cta ? (
          <Link href="/new" className="btn btn-signal btn-small">
            Make yours
          </Link>
        ) : null}
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <span>flexwall.lol, a lock screen that keeps score</span>
      <nav aria-label="Footer">
        <Link href="/setup">Setup guide</Link>
        <Link href="/legal">Terms &amp; privacy</Link>
      </nav>
    </footer>
  );
}
