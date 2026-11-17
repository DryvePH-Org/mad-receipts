import { redirect } from "next/navigation";

// Sold papers are now added on each car's page in Car documents. Old links keep working.
export default function UploadDocumentsPage() {
  redirect("/documents");
}
