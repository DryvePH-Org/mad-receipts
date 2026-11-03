"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

/** "Install app": appears only when the browser says the app can be installed. */
export function InstallButton({ className }: { className?: string }) {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => setPromptEvent(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!promptEvent) return null;
  return (
    <Button
      type="button"
      variant="outline"
      className={className}
      onClick={async () => {
        await promptEvent.prompt();
        setPromptEvent(null);
      }}
    >
      <Download /> Install app
    </Button>
  );
}
