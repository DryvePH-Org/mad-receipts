import { PageHeader } from "@/components/layout/page-header";
import { BUY_SHEET_ID, SELL_SHEET_ID, sheetUrl } from "@/lib/dashboard/sheets";
import { DashboardNav } from "./dashboard-nav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Straight from the team's Google Sheets, read again each time you open or refresh this page. Nothing is typed here." />
      <DashboardNav buyUrl={sheetUrl(BUY_SHEET_ID)} sellUrl={sheetUrl(SELL_SHEET_ID)} />
      {children}
    </div>
  );
}
