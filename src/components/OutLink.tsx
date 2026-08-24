import { identityLink } from "@/lib/identity-link";

export function XLogo({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function LinkIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

/** Icon next to a name when the name itself points somewhere (X handle, URL, domain). */
export default function OutLink({ name, size = 14 }: { name: string; size?: number }) {
  const link = identityLink(name);
  if (!link) return null;
  return (
    <a
      className="out-link"
      href={link.href}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      aria-label={link.kind === "x" ? "Open on X" : "Open " + link.label}
    >
      {link.kind === "x" ? <XLogo size={size} /> : <LinkIcon size={size} />}
    </a>
  );
}
