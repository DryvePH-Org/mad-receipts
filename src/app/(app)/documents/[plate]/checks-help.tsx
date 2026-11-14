import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CHECKS_BY_APP, CHECKS_BY_BOT } from "@/lib/docs/checks-catalog";

/** What the scan really checks: what the bot reads from each photo, and which red flags the app raises by comparing the photos with each other and with the car. */
export function ChecksHelp() {
  return (
    <Card id="checks">
      <CardHeader><CardTitle>What the scan checks</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        <details className="rounded-lg border">
          <summary className="cursor-pointer px-3 py-2 font-medium">The bot reads, on every photo</summary>
          <ul className="list-disc space-y-1 border-t p-3 pl-7">{CHECKS_BY_BOT.map((c) => <li key={c.title}><b>{c.title}.</b> {c.detail}</li>)}</ul>
        </details>
        <details className="rounded-lg border">
          <summary className="cursor-pointer px-3 py-2 font-medium">The red flags the app raises</summary>
          <ul className="list-disc space-y-1 border-t p-3 pl-7">{CHECKS_BY_APP.map((c) => <li key={c.title}><b>{c.title}.</b> {c.detail}</li>)}</ul>
        </details>
        <p className="text-muted-foreground">A flag is a question for a person, never a verdict. Open &ldquo;What the bot saw&rdquo; under a photo to see exactly what was read and how sure the bot was.</p>
      </CardContent>
    </Card>
  );
}
