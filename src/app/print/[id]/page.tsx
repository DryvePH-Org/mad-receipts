import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getReceipt, getSettings } from "@/lib/data";
import type { FormState } from "@/lib/deal/types";
import { PrintView } from "./print-view";

export default function PrintPage({ params }: PageProps<"/print/[id]">) {
  return <Suspense><Content params={params} /></Suspense>;
}

async function Content({ params }: { params: PageProps<"/print/[id]">["params"] }) {
  await requireUser();
  const { id } = await params;
  const receipt = await getReceipt(id);
  if (!receipt || Object.keys(receipt.snapshot).length === 0) notFound();
  const settings = await getSettings();
  return <PrintView state={receipt.snapshot as FormState} company={settings.company} copyNames={settings.copyNames} unapproved={receipt.status !== "approved"} backHref={`/deals/${receipt.dealId}`} />;
}
