import { redirect } from "next/navigation";

// The Docs Bible table is now a view inside Car documents. Old links keep working.
export default function DocsBiblePage() {
  redirect("/documents");
}
