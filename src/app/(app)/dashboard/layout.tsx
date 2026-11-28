import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { getCurrentUser } from "@/lib/auth";
import { BUY_SHEET_ID, SELL_SHEET_ID, sheetUrl } from "@/lib/dashboard/sheets";
import { DashboardNav } from "./dashboard-nav";

/** The tabs; Payments (banks and ways of payment) is part of the Dashboard. */
async function Nav() {
  const me = await getCurrentUser();
  return <DashboardNav buyUrl={sheetUrl(BUY_SHEET_ID)} sellUrl={sheetUrl(SELL_SHEET_ID)} payments={!!me?.modules.includes("dashboard")} />;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Straight from the team's Google Sheets. Buy and Sell are read again each time you open or refresh; Payments is a copy MAD keeps of the payments sheet. Nothing is typed here." />
      <Suspense fallback={<DashboardNav buyUrl={sheetUrl(BUY_SHEET_ID)} sellUrl={sheetUrl(SELL_SHEET_ID)} />}><Nav /></Suspense>
      {children}
    </div>
  );
}
