import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { loadTransmittal } from "@/lib/docs/transmittal-server";
import { TransmittalPrint } from "./transmittal-print";

export default function PrintTransmittalPage({ params }: PageProps<"/print/transmittal/[plate]">) {
  return <Suspense><Content params={params} /></Suspense>;
}

async function Content({ params }: { params: PageProps<"/print/transmittal/[plate]">["params"] }) {
  const user = await requireModule("documents");
  const { plate } = await params;
  const t = await loadTransmittal(plate, user.fullName ?? user.email);
  if (!t) notFound();
  const settings = await getSettings();
  return <TransmittalPrint data={t.saved ?? t.prefill} print={settings.print} backHref={`/documents/${plate}/transmittal`} />;
}
