import { publicSourceDomain } from "@/domain/source-domain";
import type { InputValue } from "@flexwall/sdk";

/** Verification describes the provenance of every input, not an audit of the metric or its owner. */
export function provenanceOf(inputs: Record<string, InputValue | undefined>) {
  const values = Object.values(inputs).filter((value): value is InputValue => Boolean(value));
  if (!values.length) return null;
  if (values.some((value) => value.source?.sample)) return { kind: "sample", label: "Sample data", detail: "Illustrative data, not a verified account" } as const;
  const sources = [...new Set(values.flatMap((value) => value.source ? [value.source.name] : []))];
  const names = sources.join(" + ");
  if (values.some((value) => value.stale)) return { kind: "stale", label: `Last known${names ? ` · ${names}` : ""}`, detail: "Source unavailable: showing the last known value" } as const;
  if (values.every((value) => value.source?.verified)) return { kind: "verified", label: `Verified · ${names}`, detail: `Source verified: retrieved directly from ${names} through a connected account. Values are not entered manually in Flexwall. Labels and targets are chosen by the owner; this is not an audit or an endorsement by ${names}.` } as const;
  if (values.every((value) => value.source)) {
    const domains = [...new Set(values.flatMap((value) => {
      const domain = publicSourceDomain(value.source?.domain);
      return domain ? [domain] : [];
    }))];
    return { kind: "synced", label: `API verified · ${names}`, detail: `API response verified from ${domains.length ? domains.join(" + ") : names}. Confirms the data received, not independent accuracy or account ownership.` } as const;
  }
  if (sources.length) return { kind: "mixed", label: "Mixed sources", detail: "Includes manually entered data; not fully verified" } as const;
  return { kind: "manual", label: "Manually entered", detail: "Entered by the owner, not independently verified" } as const;
}
