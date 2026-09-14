import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Editor } from "@/components/editor/Editor";
import { container } from "@/composition";
import { DomainError } from "@/domain/errors";
import { sessionUserId } from "@/presentation/http";

export const metadata: Metadata = { title: "Edit your wall", robots: { index: false } };

export default async function EditPage() {
  const userId = await sessionUserId();
  if (!userId) redirect("/login");
  const c = container();
  const owner = await c.getOwnerWall.execute({ userId }).catch((error) => {
    if (error instanceof DomainError && (error.code === "not_found" || error.code === "unauthenticated")) redirect(error.code === "not_found" ? "/onboarding" : "/login");
    throw error;
  });
  return <Editor wall={owner.wall} entitlements={owner.entitlements} connections={owner.connections} lockscreenPath={owner.lockscreenPath} appUrl={c.appUrl} />;
}
