"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { goBackAction, switchBotAction } from "./bot-actions";
import { removePersonAction, savePersonAction } from "./people-actions";

export interface PersonRow { tgId: number; name: string; role: string }

export function PeoplePanel({ people, botReady, webhook }: { people: PersonRow[]; botReady: boolean; webhook: { url: string; pending: number; error: string | null } | null }) {
  const [confirm, setConfirm] = useState("");
  const [busy, start] = useTransition();
  const [f, setF] = useState({ tgId: "", name: "", role: "repairman" as "repairman" | "approver" | "admin" });
  const add = () => start(async () => {
    const r = await savePersonAction({ tgId: Number(f.tgId), name: f.name, role: f.role });
    if (r.ok) { toast.success("Saved."); setF({ tgId: "", name: "", role: "repairman" }); } else toast.error(r.error);
  });
  return (
    <details className="rounded-xl ring-1 ring-foreground/10">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Telegram bot: who may use it ({people.length}){botReady ? "" : " · not connected yet"}</summary>
      <div className="space-y-3 border-t px-4 py-4 text-sm">
        <p className="text-muted-foreground">People in the repairs group: repairmen report, Approvers and Admins approve. The Telegram id is what the bot shows when someone sends /whoami in the group.</p>
        {people.length > 0 && (
          <ul className="divide-y rounded-lg ring-1 ring-foreground/10">
            {people.map((p) => (
              <li key={p.tgId} className="flex items-center gap-3 px-3 py-2"><span className="font-medium">{p.name}</span><span className="text-muted-foreground">{p.role} · {p.tgId}</span>
                <Button className="ml-auto" size="sm" variant="ghost" disabled={busy} onClick={() => start(async () => { const r = await removePersonAction(p.tgId); if (!r.ok) toast.error(r.error); })}>Remove</Button></li>
            ))}
          </ul>
        )}
        {botReady && (
          <div className="space-y-2 rounded-lg bg-muted/50 p-3">
            <p className="font-medium">Where the group&apos;s messages go now: {webhook ? (webhook.url.endsWith("/api/repairs/telegram") ? "to this app" : webhook.url ? "to another address (the old bot's webhook)" : "to the old bot (it polls)") : "could not be read"}</p>
            {webhook?.error && <p className="text-red-700">Telegram&apos;s last error: {webhook.error}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <Input aria-label="Type SWITCH to confirm" className="h-8 w-40" placeholder="Type SWITCH" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              <Button size="sm" disabled={busy || confirm.trim().toUpperCase() !== "SWITCH"} onClick={() => start(async () => { const r = await switchBotAction(confirm); if (r.ok) { toast.success(r.message); setConfirm(""); } else toast.error(r.error); })}>Switch the bot to the app</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => start(async () => { const r = await goBackAction(); if (r.ok) toast.success(r.message); else toast.error(r.error); })}>Go back to the old bot</Button>
            </div>
            <p className="text-xs text-muted-foreground">Switching takes the group&apos;s messages away from the old bot at once; stop the old bot on the server too so it does not keep trying. Going back removes the app&apos;s address, so the old bot receives the messages again.</p>
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-4">
          <Input aria-label="Telegram id" inputMode="numeric" placeholder="Telegram id" value={f.tgId} onChange={(e) => setF({ ...f, tgId: e.target.value.replace(/\D/g, "") })} />
          <Input aria-label="Name" placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <select className="h-9 rounded-md border bg-background px-2" aria-label="Role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as typeof f.role })}>
            <option value="repairman">Repairman</option><option value="approver">Approver</option><option value="admin">Admin</option>
          </select>
          <Button disabled={busy || !f.tgId || !f.name.trim()} onClick={add}>Add or change</Button>
        </div>
      </div>
    </details>
  );
}
