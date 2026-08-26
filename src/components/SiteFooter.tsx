import Link from "next/link";

/** Shared footer: identical on every page, source link included. */
export default function SiteFooter({ left = "flexwall.lol" }: { left?: string }) {
  return (
    <footer>
      <span>
        {left} · <Link className="footer-link" href="/board">full list</Link>{" "}
        · <Link className="footer-link" href="/about">about</Link> ·{" "}
        <a
          className="footer-link"
          href="https://github.com/ghota-tech-solutions-sass/flexwall"
          target="_blank"
          rel="noopener noreferrer"
        >
          source
        </a>
      </span>
      <span>no refunds</span>
    </footer>
  );
}
