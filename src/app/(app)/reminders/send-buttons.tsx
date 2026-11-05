"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendReminders } from "./actions";

export function SendReminderButton({ itemKey, label }: { itemKey?: string; label?: string }) {
  const [pending, start] = useTransition();
  const [sent, setSent] = useState(false);
  if (sent && itemKey) return <span className="text-xs font-medium text-emerald-700">Sent to Telegram</span>;
  return (
    <Button size={itemKey ? "sm" : "default"} variant={itemKey ? "outline" : "default"} disabled={pending} onClick={() => start(async () => {
      const r = await sendReminders(itemKey);
      if (r.ok) { setSent(true); toast.success(`Sent ${r.sent} ${r.sent === 1 ? "reminder" : "reminders"} to Telegram.`); } else toast.error(r.error);
    })}><Send /> {label ?? "Send reminder"}</Button>
  );
}
