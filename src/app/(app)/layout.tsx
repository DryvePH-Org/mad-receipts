import { BottomNav } from "@/components/bottom-nav";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 border-b bg-background">
        <div className="mx-auto flex h-14 max-w-lg items-center px-4">
          <span className="font-semibold">MAD Receipts</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 pb-20">{children}</main>
      <BottomNav />
    </div>
  );
}
