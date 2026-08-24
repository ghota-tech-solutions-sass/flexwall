import type { PublicEntry } from "@/lib/store/entries";

/** Round avatar for a seat, when one was stored at credit time. Renders nothing otherwise. */
export default function SeatAvatar({
  entry,
  size = "sm",
}: {
  entry: Pick<PublicEntry, "slug" | "hasAvatar">;
  size?: "sm" | "md" | "xl";
}) {
  if (!entry.hasAvatar) return null;
  const px = size === "xl" ? 40 : size === "md" ? 28 : 20;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={`seat-avatar seat-avatar-${size}`}
      src={`/api/avatar/${entry.slug}`}
      alt=""
      width={px}
      height={px}
    />
  );
}
