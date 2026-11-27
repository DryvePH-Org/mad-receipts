import { redirect } from "next/navigation";

// Home is everyone's landing page (their own work and what needs them).
export default function Home() {
  redirect("/home");
}
