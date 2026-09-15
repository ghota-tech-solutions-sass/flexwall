import { displayNameText, type DisplayName } from "@/domain/connection";

/** An account's name that may be cut to fit, followed by the number telling it apart, which never is. */
export function ConnectionTitle({ shown, fallback }: { shown: DisplayName | undefined; fallback: string }) {
  const { name, number } = shown ?? { name: fallback, number: null };
  return (
    <span className="conn-title" title={displayNameText({ name, number })}>
      <span>{name}</span>
      {number === null ? null : <span className="conn-title-number">· {number}</span>}
    </span>
  );
}
