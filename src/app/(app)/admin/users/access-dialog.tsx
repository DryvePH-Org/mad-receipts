"use client";

import { useState, useTransition } from "react";
import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { ADMIN_FLOOR, effectiveModules, NAV_ITEMS, ROLE_LABELS, roleModules, SENSITIVE, type ModuleId, type Role } from "@/lib/navigation";
import { setModuleAccess } from "./actions";

type Choice = "role" | "allow" | "hide";
const label = (id: ModuleId) => NAV_ITEMS.find((i) => i.id === id)?.label ?? id;

/** What one person may open: the role's modules, with any module added or hidden. Saving shows what will change and asks to confirm. */
export function AccessDialog({ userId, name, role, grants, denies, locked }: { userId: string; name: string; role: Role; grants: string[]; denies: string[]; locked: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const base = roleModules(role);
  const initial = (): Record<string, Choice> => Object.fromEntries(NAV_ITEMS.map((i) => [i.id, denies.includes(i.id) ? "hide" : grants.includes(i.id) && !base.includes(i.id) ? "allow" : "role"]));
  const [choice, setChoice] = useState<Record<string, Choice>>(initial);
  const custom = denies.length > 0 || grants.some((g) => !base.includes(g as ModuleId));
  const g = NAV_ITEMS.filter((i) => choice[i.id] === "allow").map((i) => i.id);
  const d = NAV_ITEMS.filter((i) => choice[i.id] === "hide").map((i) => i.id);
  const before = effectiveModules(role, grants, denies);
  const final = effectiveModules(role, g, d);
  const gained = final.filter((m) => !before.includes(m));
  const lost = before.filter((m) => !final.includes(m));
  const power = gained.filter((m) => SENSITIVE.includes(m));
  const changed = gained.length > 0 || lost.length > 0 || g.length !== grants.filter((x) => !base.includes(x as ModuleId)).length || d.length !== denies.length;

  function close() { setOpen(false); setConfirming(false); setTyped(""); setError(null); }
  function save() {
    start(async () => {
      const r = await setModuleAccess(userId, g, d, typed);
      if (r.ok) { toast.success(r.message); close(); } else setError(r.message);
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => { setChoice(initial()); setConfirming(false); setTyped(""); setError(null); setOpen(true); }}>{custom ? "Access (changed)" : "Access"}</Button>
      <ResponsiveDialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())} title={confirming ? `Confirm the change for ${name}` : `Access for ${name}`}
        description={confirming ? "Check what will change." : `${ROLE_LABELS[role]} role. Add a module the role does not have, or hide one it has. Hiding always wins.`} className="sm:max-w-xl">
        {!confirming ? (
          <div className="space-y-3">
            <ul className="divide-y rounded-lg border">
              {NAV_ITEMS.map((i) => {
                const inRole = base.includes(i.id);
                const floor = role === "admin" && ADMIN_FLOOR.includes(i.id);
                const has = final.includes(i.id);
                return (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 p-2.5">
                    <div className="min-w-0"><p className="text-sm font-medium">{i.label}{SENSITIVE.includes(i.id) && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">powerful</span>}</p>
                      <p className="text-xs text-muted-foreground">{has ? "Can open" : "Cannot open"}{inRole ? " · in the role" : ""}</p></div>
                    {floor ? <span className="text-xs text-muted-foreground">Always on for Admins</span> : (
                      <div className="w-40"><NativeSelect aria-label={`${i.label} for ${name}`} value={choice[i.id]} onChange={(e) => setChoice({ ...choice, [i.id]: e.target.value as Choice })}>
                        {inRole ? <><option value="role">Included by the role</option><option value="hide">Hide</option></> : <><option value="role">Not included</option><option value="allow">Allow</option></>}
                      </NativeSelect></div>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-muted-foreground">Powerful modules: approving receipts, Settings, Users and Sync jobs. Giving one asks you to type GRANT. Wiping data (Settings → Delete data) stays with the Admin role whatever you choose.</p>
            {locked && <p role="alert" className="text-sm text-destructive">You cannot change your own access. Ask another Admin.</p>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={close}>Cancel</Button>
              <Button type="button" disabled={locked || !changed} onClick={() => setConfirming(true)}>Review the change…</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2 rounded-lg border p-3 text-sm">
              {gained.length > 0 && <p><b className="font-medium text-emerald-700">{name} will be able to open:</b> {gained.map(label).join(", ")}</p>}
              {lost.length > 0 && <p><b className="font-medium text-destructive">{name} will no longer be able to open:</b> {lost.map(label).join(", ")}</p>}
              {gained.length === 0 && lost.length === 0 && <p>The modules stay the same. Only how they are set changes.</p>}
              <p className="text-xs text-muted-foreground">It applies the next time they open a page. Everything is written to the activity log.</p>
            </div>
            {power.length > 0 && (
              <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-500/10 dark:text-amber-100">
                <p className="flex gap-2"><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /><span><b className="font-medium">This gives real power:</b> {power.map(label).join(", ")}.
                  {power.includes("approvals") && " They will be able to approve receipts (never their own)."}{power.includes("settings") && " They will be able to change every list and rule."}
                  {power.includes("users") && " They will be able to create and manage ordinary accounts, but not Admins."}{power.includes("sync") && " They will be able to retry and run sync jobs."}</span></p>
                <div className="space-y-1.5"><Label htmlFor="grant-word">Type GRANT to confirm</Label><Input id="grant-word" value={typed} placeholder="GRANT" autoComplete="off" onChange={(e) => setTyped(e.target.value)} /></div>
              </div>
            )}
            {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" disabled={pending} onClick={() => { setConfirming(false); setError(null); }}>Back</Button>
              <Button type="button" disabled={pending || (power.length > 0 && typed.trim() !== "GRANT")} onClick={save}>{pending ? "Saving…" : "Confirm and save"}</Button>
            </div>
          </div>
        )}
      </ResponsiveDialog>
    </>
  );
}
