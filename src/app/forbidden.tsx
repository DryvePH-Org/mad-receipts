import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Forbidden() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-xl font-semibold">Admins only</h1>
      <p className="text-muted-foreground">You don&apos;t have access to this page.</p>
      <Button render={<Link href="/" />} nativeButton={false} className="h-12 px-6">
        Go home
      </Button>
    </main>
  );
}
