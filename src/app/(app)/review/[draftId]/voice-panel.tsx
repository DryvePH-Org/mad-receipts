"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { VoiceResult } from "@/lib/extraction/voice-schema";

const MAX_SECONDS = 90;

/** The audio format this browser can record: webm on Android and desktop, mp4 on iPhone. */
function recorderType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

type State = "idle" | "recording" | "processing";

const noSubscription = () => () => {};

/** Whether this browser can record. False on the server and during hydration, so both agree. */
function useCanRecord(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => !!navigator.mediaDevices?.getUserMedia && recorderType() !== null,
    () => false,
  );
}

/**
 * Optional voice note: staff say the receipt details and who sold the car with each person's
 * commission. The audio is sent to the server, turned into fields, and not kept.
 */
export function VoicePanel({
  draftId,
  last,
  onResult,
}: {
  draftId: string;
  last: VoiceResult | null;
  onResult: (result: VoiceResult) => void;
}) {
  const [state, setState] = useState<State>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunks = useRef<Blob[]>([]);

  const supported = useCanRecord();

  function release() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }
  // Turn the microphone off if staff leave the page while recording.
  useEffect(() => release, []);

  async function send(body: FormData) {
    setState("processing");
    setError(null);
    body.set("draftId", draftId);
    const res = await fetch("/api/voice", { method: "POST", body }).catch(() => null);
    const json = res ? await res.json().catch(() => null) : null;
    setState("idle");
    if (!res || !res.ok || !json?.voice) {
      setError(json?.error ?? "Couldn't reach the server. Check your connection and try again.");
      return;
    }
    onResult(json.voice as VoiceResult);
    setText("");
    setTyping(false);
  }

  async function start() {
    setError(null);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("The microphone is blocked. Allow it in the browser settings, or type the details instead.");
      return;
    }
    const mimeType = recorderType() ?? "";
    const rec = new MediaRecorder(stream.current, mimeType ? { mimeType } : undefined);
    chunks.current = [];
    rec.ondataavailable = (event) => event.data.size > 0 && chunks.current.push(event.data);
    rec.onstop = () => {
      const type = rec.mimeType || mimeType || "audio/webm";
      release();
      const blob = new Blob(chunks.current, { type });
      if (blob.size < 1000) {
        setState("idle");
        setError("I didn't catch anything. Try again, closer to the phone.");
        return;
      }
      const body = new FormData();
      body.set("audio", blob, "voice");
      void send(body);
    };
    recorder.current = rec;
    rec.start();
    setSeconds(0);
    setState("recording");
    timer.current = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= MAX_SECONDS) stop();
        return s + 1;
      });
    }, 1000);
  }

  function stop() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  const typedBox = (
    <div className="space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="Salesman David 3 percent, Ella 1 percent. Plate NKF 4771…"
        className="w-full rounded-lg border border-input bg-transparent p-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
        aria-label="Type the details instead"
      />
      <Button
        type="button"
        variant="outline"
        disabled={state === "processing" || !text.trim()}
        onClick={() => {
          const body = new FormData();
          body.set("text", text);
          void send(body);
        }}
        size="lg"
        className="w-full"
      >
        {state === "processing" ? "Reading…" : "Read this note"}
      </Button>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Voice note (optional)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Say the receipt details and who sold the car, with each person&apos;s commission. For example:
          &quot;Salesman David, 3 percent. Other salesman Ella, 1 percent.&quot; It fills the form, and anything that
          doesn&apos;t match the photo is shown for you to choose.
        </p>

        {supported ? (
          state === "recording" ? (
            <Button type="button" onClick={stop} variant="destructive" size="lg" className="w-full">
              <Square className="size-5" /> Stop and read ({seconds}s)
            </Button>
          ) : (
            <Button type="button" onClick={start} disabled={state === "processing"} size="lg" className="w-full">
              {state === "processing" ? (
                <>
                  <Loader2 className="size-5 animate-spin" /> Reading your note…
                </>
              ) : (
                <>
                  <Mic className="size-5" /> {last ? "Record again" : "Record voice note"}
                </>
              )}
            </Button>
          )
        ) : (
          <p className="text-sm text-muted-foreground">This browser can&apos;t record audio. Type the details instead.</p>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {last && state !== "recording" && (
          <p className="rounded-lg bg-muted p-3 text-sm">
            <span className="font-medium">{last.source === "typed" ? "You typed" : "I heard"}:</span> {last.transcript}
          </p>
        )}
        {last && state !== "recording" && last.unsure && last.unsure.length > 0 && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-500/40 dark:bg-amber-950/30">
            I wasn&apos;t sure about {last.unsure.join(", ")}, so I left {last.unsure.length === 1 ? "it" : "them"} blank. Please type
            {last.unsure.length === 1 ? " it" : " them"} or record again.
          </p>
        )}
        {last && state !== "recording" && last.unclear && last.unclear.length > 0 && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-500/40 dark:bg-amber-950/30">
            Part of the recording was unclear, so I ignored it: &quot;{last.unclear.join(" … ")}&quot;. Record again if something
            important was in it.
          </p>
        )}

        {supported && !typing ? (
          <button type="button" onClick={() => setTyping(true)} className="text-sm font-medium underline">
            Type it instead
          </button>
        ) : (
          typedBox
        )}
      </CardContent>
    </Card>
  );
}
