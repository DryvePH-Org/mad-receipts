"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { ADMIN_FLOOR, effectiveModules, GRANTABLE, NAV_ITEMS, ROLE_LABELS, roleModules, type ModuleId, type Role } from "@/lib/navigation";
import { setModuleAccess } from "./actions";

type Choice = "role" | "allow" | "hide";

/** What one person may open: the role's modules, with extras added or some hidden. */
export function AccessDialog({ userId, name, role, grants, denies, locked }: { userId: string; name: string; role: Role; grants: string[]; denies: string[]; locked: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const base = roleModules(role);
  const initial = (): Record<string, Choice> => Object.fromEntries(NAV_ITEMS.map((i) => [i.id, denies.includes(i.id) ? "hide" : grants.includes(i.id) && !base.includes(i.id) ? "allow" : "role"]));
  const [choice, setChoice] = useState<Record<string, Choice>>(initial);
  const custom = denies.length > 0 || grants.some((g) => !base.includes(g as ModuleId));
  const g = NAV_ITEMS.filter((i) => choice[i.id] === "allow").map((i) => i.id);
  const d = NAV_ITEMS.filter((i) => choice[i.id] === "hide").map((i) => i.id);
  const final = effectiveModules(role, g, d);

  function save() {
    start(async () => {
      const r = await setModuleAccess(userId, g, d);
      if (r.ok) { toast.success(r.message); setOpen(false); } else toast.error(r.message);
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => { setChoice(initial()); setOpen(true); }}>{custom ? "Access (changed)" : "Access"}</Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen} title={`Access for ${name}`} description={`${ROLE_LABELS[role]} role. Add a module the role does not have, or hide one it has. Hiding always wins.`} className="sm:max-w-xl">
        <div className="space-y-3">
          <ul className="divide-y rounded-lg border">
            {NAV_ITEMS.map((i) => {
              const inRole = base.includes(i.id);
              const floor = role === "admin" && ADMIN_FLOOR.includes(i.id);
              const canAdd = !inRole && GRANTABLE.includes(i.id);
              const has = final.includes(i.id);
              return (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 p-2.5">
                  <div className="min-w-0"><p className="text-sm font-medium">{i.label}</p><p className="text-xs text-muted-foreground">{has ? "Can open" : "Cannot open"}{inRole ? " · in the role" : ""}</p></div>
                  {floor ? <span className="text-xs text-muted-foreground">Always on for Admins</span>
                    : !inRole && !canAdd ? <span className="text-xs text-muted-foreground">Only with the role</span>
                    : (
                      <div className="w-40"><NativeSelect aria-label={`${i.label} for ${name}`} value={choice[i.id]} onChange={(e) => setChoice({ ...choice, [i.id]: e.target.value as Choice })}>
                        {inRole ? <><option value="role">Included by the role</option><option value="hide">Hide</option></> : <><option value="role">Not included</option><option value="allow">Allow</option></>}
                      </NativeSelect></div>
                    )}
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">Approving, the cash report, the activity log, Settings, Users and Sync jobs come only with the role, because they depend on the role&apos;s rights in the database.</p>
          {locked && <p role="alert" className="text-sm text-destructive">You cannot change your own access. Ask another Admin.</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" disabled={pending || locked} onClick={save}>{pending ? "Saving…" : "Save access"}</Button>
          </div>
        </div>
      </ResponsiveDialog>
    </>
  );
}
