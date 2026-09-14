import type { Metadata } from "next";
import { TopBar } from "@/components/site/Chrome";
import { ReportForm } from "@/components/site/ReportForm";
import { sessionUserId } from "@/presentation/http";

export const metadata: Metadata = { title: "Report a wall", robots: { index: false } };

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ handle?: string }> }) {
  const { handle } = await searchParams;
  return (
    <div className="page">
      <TopBar signedIn={Boolean(await sessionUserId())} />
      <main className="auth">
        <h1>Report a wall</h1>
        <p className="hint">Impersonation, fake numbers passed off as verified, harmful content. A person reads every report.</p>
        <ReportForm handle={handle ?? ""} />
      </main>
    </div>
  );
}
