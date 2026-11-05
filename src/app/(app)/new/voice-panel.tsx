"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Keyboard, Loader2, Mic, Square, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { VoiceProposal } from "@/lib/voice/schema";
import { cn } from "@/lib/utils";

export interface VoiceOutcome { filled: string[]; kept: string[]; notes: string[] }
const MAX_SECONDS = 90;

function recorderType(): string {
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  return "";
}

/** Say or type the receipt: Whisper hears it, gpt-oss reads it, and the form is filled with only what was really said. */
export function VoicePanel({ apply }: { apply: (p: VoiceProposal, overwrite: boolean) => VoiceOutcome }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"voice" | "type">("voice");
  const [state, setState] = useState<"idle" | "recording" | "reading">("idle");
  const [seconds, setSeconds] = useState(0);
  const [note, setNote] = useState("");
  const [proposal, setProposal] = useState<VoiceProposal | null>(null);
  const [outcome, setOutcome] = useState<VoiceOutcome | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  // The recording finishes later, so it must use the form as it is then, not as it was when recording began.
  const applyRef = useRef(apply);
  useEffect(() => { applyRef.current = apply; });

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); recorder.current?.stream.getTracks().forEach((t) => t.stop()); }, []);

  async function send(body: FormData) {
    setState("reading");
    try {
      const res = await fetch("/api/voice", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { proposal?: VoiceProposal; error?: string };
      if (!res.ok || !json.proposal) { toast.error(json.error ?? "Couldn't read that. Try again, or type the details."); return; }
      setProposal(json.proposal);
      const result = applyRef.current(json.proposal, false);
      setOutcome(result);
      if (!result.filled.length) toast.message("Nothing new to fill in from that. Check the words below.");
    } catch {
      toast.error("No connection to the voice reader. Try again, or type the details.");
    } finally { setState("idle"); }
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { toast.error("This browser can't record. Type the details instead."); setMode("type"); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const type = recorderType();
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timer.current) clearInterval(timer.current);
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size < 2000) { setState("idle"); toast.error("That was too short. Hold on a little longer, then press stop."); return; }
        const body = new FormData();
        body.set("audio", new File([blob], "voice", { type: blob.type }));
        void send(body);
      };
      recorder.current = rec;
      rec.start();
      setSeconds(0); setState("recording");
      timer.current = setInterval(() => setSeconds((n) => { if (n + 1 >= MAX_SECONDS) rec.stop(); return n + 1; }), 1000);
    } catch {
      toast.error("The microphone is blocked. Allow it in the browser, or type the details instead.");
    }
  }
  const stop = () => recorder.current?.state === "recording" && recorder.current.stop();
  const readTyped = () => { const body = new FormData(); body.set("text", note); void send(body); };

  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50">
        <span className="grid size-8 place-items-center rounded-lg bg-muted"><Wand2 className="size-4" /></span>
        <span className="min-w-0 flex-1"><b className="block text-sm font-medium">Fill it by voice</b><span className="block text-xs text-muted-foreground">Say the details, in English or Tagalog. Only what you really said is filled in.</span></span>
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div className="space-y-4 border-t p-4">
          <div className="inline-flex rounded-lg bg-muted p-0.5" role="radiogroup" aria-label="How to give the details">
            {([["voice", "Speak", Mic], ["type", "Type it", Keyboard]] as const).map(([m, label, Icon]) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} disabled={state !== "idle"}
                className={cn("flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium", mode === m ? "bg-background shadow-sm" : "text-muted-foreground")}><Icon className="size-3.5" />{label}</button>
            ))}
          </div>
          {mode === "voice" ? (
            <div className="flex flex-wrap items-center gap-3">
              {state === "recording" ? <Button type="button" variant="destructive" onClick={stop}><Square /> Stop · {seconds}s</Button>
                : <Button type="button" onClick={start} disabled={state === "reading"}>{state === "reading" ? <Loader2 className="animate-spin" /> : <Mic />}{state === "reading" ? "Reading…" : "Start recording"}</Button>}
              <p className="text-xs text-muted-foreground">Example: “Buyer Maria Santos, 0917 123 4567, Vios plate N K F 4 7 7 1, price 720 thousand, BDO financing, 20 percent down, 7 percent processing fee, paid 120 thousand in cash, earlier paid 20 thousand.”</p>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea aria-label="Type the details" value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={2000} placeholder="Type or paste the details the way you would say them"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />
              <Button type="button" onClick={readTyped} disabled={!note.trim() || state === "reading"}>{state === "reading" ? <Loader2 className="animate-spin" /> : <Wand2 />} Read it</Button>
            </div>
          )}

          {proposal && outcome && (
            <div className="space-y-3 text-sm" aria-live="polite">
              <p className="rounded-lg bg-muted p-3"><b className="font-medium">I heard:</b> <span className="text-muted-foreground">“{proposal.transcript}”</span></p>
              {outcome.filled.length > 0 && <p><b className="font-medium text-emerald-800 dark:text-emerald-300">Filled in:</b> {outcome.filled.join(", ")}. <span className="text-muted-foreground">Check each one against the paper.</span></p>}
              {outcome.kept.length > 0 && (
                <p className="rounded-lg bg-amber-50 p-3 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">You had already typed {outcome.kept.join(", ")}, so I left {outcome.kept.length === 1 ? "it" : "them"} alone.{" "}
                  <button type="button" className="underline" onClick={() => setOutcome(applyRef.current(proposal, true))}>Use what I heard instead</button></p>
              )}
              {outcome.notes.map((n) => <p key={n} className="rounded-lg bg-amber-50 p-3 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">{n}</p>)}
              {proposal.unsure.length > 0 && <p className="rounded-lg bg-amber-50 p-3 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">I couldn’t be sure about {proposal.unsure.join(", ")}, so {proposal.unsure.length === 1 ? "it is" : "they are"} left blank. Please type {proposal.unsure.length === 1 ? "it" : "them"}.</p>}
              {proposal.unclear.length > 0 && <p className="text-xs text-muted-foreground">Parts I couldn’t hear clearly were ignored: “{proposal.unclear.join("”, “")}”.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
