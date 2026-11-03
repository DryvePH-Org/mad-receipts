import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

export default function Forbidden() {
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <div className="w-full max-w-md">
        <EmptyState
          icon={ShieldAlert}
          title="Admins only"
          description="You don't have access to this page."
          action={
            <Button nativeButton={false} render={<Link href="/" />}>
              Go home
            </Button>
          }
        />
      </div>
    </main>
  );
}
