import { Suspense } from "react";
import { AdminNav } from "@/components/admin-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { setSalespersonActive } from "./actions";
import { AddSalespersonForm } from "./add-form";
import { EditSalespersonDialog } from "./edit-dialog";

export default function SalespeoplePage() {
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">Salespeople</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
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
    <>
      <AdminNav />
      <p className="text-sm text-muted-foreground">
        These are the names staff can say in the voice recording and pick on the review screen. Add each
        salesperson with the nicknames people use, so the recording is understood correctly.
      </p>

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
            <p className="text-sm text-muted-foreground">No one yet. Add the first salesperson above.</p>
          ) : (
            <ul className="divide-y">
              {data.map((person) => (
                <li key={person.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className={person.active ? "truncate font-medium" : "truncate font-medium text-muted-foreground"}>
                      {person.name}
                    </p>
                    {person.aliases.length > 0 && (
                      <p className="truncate text-sm text-muted-foreground">Also: {person.aliases.join(", ")}</p>
                    )}
                    {!person.active && (
                      <Badge variant="secondary" className="mt-1">
                        Not offered for new sales
                      </Badge>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <EditSalespersonDialog id={person.id} name={person.name} aliases={person.aliases} />
                    <form action={setSalespersonActive}>
                      <input type="hidden" name="id" value={person.id} />
                      <input type="hidden" name="active" value={person.active ? "false" : "true"} />
                      <Button type="submit" variant="ghost" className="h-10">
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
    </>
  );
}
