import { redirect } from "next/navigation";

// The check of Car status against Car documents is part of the Data check now.
export default function PriceListCheckPage() {
  redirect("/data-check?tab=differences");
}
