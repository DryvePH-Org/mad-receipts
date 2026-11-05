import { redirect } from "next/navigation";

// Transactions is the home page.
export default function Home() {
  redirect("/deals");
}
