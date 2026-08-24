/** Shared footer: identical on every page, source link included. */
export default function SiteFooter({ left = "flexwall.lol · the open register" }: { left?: string }) {
  return (
    <footer>
      <span>
        {left} ·{" "}
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
