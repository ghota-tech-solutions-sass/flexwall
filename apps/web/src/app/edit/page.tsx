import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { draftOf } from "@/application/editor/state";
import { Editor } from "@/components/editor/Editor";
import { container } from "@/composition";
import { DomainError } from "@/domain/errors";
import { todayIn } from "@/domain/time";
import { sessionUserId } from "@/presentation/http";
import { ROUTES } from "@/presentation/routes";

export const metadata: Metadata = { title: "Edit your wall", robots: { index: false } };

export default async function EditPage() {
  const userId = await sessionUserId();
  if (!userId) redirect(ROUTES.login);
  const c = container();
  const owner = await c.getOwnerWall.execute({ userId }).catch((error) => {
    if (error instanceof DomainError && error.code === "not_found") redirect(ROUTES.onboarding);
    if (error instanceof DomainError && error.code === "unauthenticated") redirect(ROUTES.login);
    throw error;
  });
  return (
    <Editor
      appUrl={c.appUrl}
      init={{
        handle: owner.wall.handle,
        entitlements: owner.entitlements,
        draft: draftOf(owner.wall),
        connections: owner.connections,
        lockscreenPath: owner.lockscreenPath,
        today: todayIn(owner.user.timeZone, Date.now()),
      }}
    />
  );
}
