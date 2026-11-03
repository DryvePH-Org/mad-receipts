import { Suspense } from "react";
import { Contact } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { Pill } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { setSalespersonActive } from "./actions";
import { AddSalespersonForm } from "./add-form";
import { EditSalespersonDialog } from "./edit-dialog";

export default function SalespeoplePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Salespeople"
        description="The names staff can say in a voice note and pick on the review screen. Add the nicknames people use so the recording is understood."
      />
      <Suspense fallback={<PageSkeleton />}>
        <SalespeopleContent />
      </Suspense>
    </div>
  );
}

async function SalespeopleContent() {
  await requireAdmin();

  const { data, error } = await createAdminClient()
    .from("salespeople")
    .select("id, name, aliases, active")
    .order("active", { ascending: false })
    .order("name");
  if (error) return <p className="text-destructive">Could not load the salespeople.</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
      <Card>
        <CardHeader>
          <CardTitle>Add a salesperson</CardTitle>
        </CardHeader>
        <CardContent>
          <AddSalespersonForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All salespeople ({data.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {data.length === 0 ? (
            <EmptyState icon={Contact} title="No salespeople yet" description="Add the first salesperson to start using voice notes." />
          ) : (
            <ul className="-my-2 divide-y">
              {data.map((person) => (
                <li key={person.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className={person.active ? "truncate font-medium" : "truncate font-medium text-muted-foreground"}>{person.name}</p>
                    {person.aliases.length > 0 && <p className="truncate text-sm text-muted-foreground">Also: {person.aliases.join(", ")}</p>}
                    {!person.active && (
                      <div className="mt-1">
                        <Pill tone="zinc">Not offered for new sales</Pill>
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <EditSalespersonDialog id={person.id} name={person.name} aliases={person.aliases} />
                    <form action={setSalespersonActive}>
                      <input type="hidden" name="id" value={person.id} />
                      <input type="hidden" name="active" value={person.active ? "false" : "true"} />
                      <Button type="submit" variant="ghost" size="sm">
                        {person.active ? "Deactivate" : "Reactivate"}
                      </Button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
