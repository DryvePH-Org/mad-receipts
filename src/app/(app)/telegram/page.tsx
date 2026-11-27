import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { isSuper, roleFromDb } from "@/lib/roles";
import { botToken, webhookInfoCached } from "@/lib/notify/bot";
import { categoriesForRole } from "@/lib/notify/categories";
import { allLinks, getLink, mutedCategories, notifyDb } from "@/lib/notify/store";
import { ROLE_LABELS } from "@/lib/navigation";
import { loadChain } from "@/lib/repairs/approval-chain";
import { loadChainChoices } from "@/lib/repairs/chain-choices";
import { ChainPanel } from "../repairs/chain-panel";
import { AdminBot, Connect, Toggle } from "./telegram-parts";

export default function TelegramPage() {
  return <Suspense fallback={<PageSkeleton />}><Content /></Suspense>;
}

async function Content() {
  const user = await requireUser();
  const mine = categoriesForRole(user.role);
  const configured = !!botToken();
  const sup = isSuper(user.role);
  // everything is asked at the same time (it used to be one thing after the other)
  const [link, muted, hook, everyone, chainRows, candidates] = await Promise.all([
    getLink(user.id).catch(() => null),
    mutedCategories(user.id).catch(() => new Set<string>()),
    sup && configured ? webhookInfoCached().catch(() => null) : null,
    sup ? Promise.all([allLinks().catch(() => []), notifyDb().from("profiles").select("id, full_name, role").order("full_name")]) : null,
    sup ? loadChain().catch(() => []) : null,
    sup ? loadChainChoices().catch(() => []) : null,
  ]);

  let people: { name: string; role: string; connected: boolean; problem: string | null }[] = [];
  if (everyone) {
    const [links, { data: profiles }] = everyone;
    const byUser = new Map(links.map((l) => [l.userId, l]));
    people = (profiles ?? []).map((p) => ({ name: (p.full_name as string | null) ?? "(no name)", role: ROLE_LABELS[roleFromDb(p.role)], connected: byUser.has(String(p.id)), problem: byUser.get(String(p.id))?.lastError ?? null }));
  }

  const chain = chainRows && candidates ? { initial: chainRows.map((c) => ({ userId: c.userId, waitMinutes: c.waitMinutes })), candidates } : null;

  return (
    <div className="space-y-6">
      <PageHeader title="My Telegram" description="Get the messages meant for you in Telegram, one by one. Messages for everyone still go to the team chats." />
      <div className="max-w-3xl space-y-6">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2">Connection {link ? <Badge>Connected</Badge> : <Badge variant="secondary">Not connected</Badge>}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!configured && <p className="text-muted-foreground">Telegram is not set up on the server yet. Tell the Admin.</p>}
            {configured && <Connect connected={!!link} username={link?.username ?? null} problem={link?.lastError ?? null} />}
            <p className="text-xs text-muted-foreground"><b>On a phone:</b> install Telegram first, then open MAD on the same phone, press Connect, tap &quot;Open Telegram and press Start&quot; and press Start. <b>On a computer:</b> press Connect, tap the button (Telegram opens, or the web version), press Start. Use the same Telegram account you use on your phone. Quiet hours: nothing is sent from 9 PM to 7 AM Manila time; it waits until 7 AM (a problem alert for the Admin is the only exception).</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>What I get ({ROLE_LABELS[user.role]})</CardTitle></CardHeader>
          <CardContent className="divide-y">
            {mine.map((c) => (
              <div key={c.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 text-sm"><p className="font-medium">{c.label}</p>{c.detail && <p className="text-muted-foreground">{c.detail}</p>}<p className="text-xs text-muted-foreground">{c.when}</p></div>
                <Toggle category={c.id} label={c.label} on={!muted.has(c.id)} />
              </div>
            ))}
          </CardContent>
        </Card>

        {isSuper(user.role) && (
          <>
            <Card>
              <CardHeader><CardTitle>Admin: the bot</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">{!configured ? "TELEGRAM_BOT_TOKEN is not set on the server." : hook?.url ? `The bot is set up and sends what people write to it to this app (${new URL(hook.url).host}).${hook.last_error_message ? ` Telegram's last problem: ${hook.last_error_message}` : ""}` : "The bot is not set up yet. Press the button once."}</p>
                {configured && <AdminBot done={!!hook?.url} />}
              </CardContent>
            </Card>
            {chain && <ChainPanel open candidates={chain.candidates} initial={chain.initial} />}
            <Card>
              <CardHeader><CardTitle>Who is connected</CardTitle></CardHeader>
              <CardContent className="divide-y text-sm">
                {people.map((p) => (
                  <div key={p.name + p.role} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                    <span className="min-w-0 truncate">{p.name} <span className="text-muted-foreground">· {p.role}</span></span>
                    {p.connected ? (p.problem ? <Badge variant="destructive" title={p.problem}>Problem</Badge> : <Badge>Connected</Badge>) : <Badge variant="secondary">Not connected</Badge>}
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
