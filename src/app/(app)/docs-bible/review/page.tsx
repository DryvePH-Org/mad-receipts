import { redirect } from "next/navigation";

// The review list is part of the Data check now.
export default function ReviewPage() {
  redirect("/data-check?tab=move");
}
