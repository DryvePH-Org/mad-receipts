import { Suspense } from "react";
import { BottomNav } from "@/components/bottom-nav";
import { UserMenu } from "@/components/user-menu";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 border-b bg-background">
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between gap-4 px-4">
          <span className="shrink-0 font-semibold">MAD Receipts</span>
          <Suspense>
            <UserMenu />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 pb-20">{children}</main>
      <BottomNav />
    </div>
  );
}
