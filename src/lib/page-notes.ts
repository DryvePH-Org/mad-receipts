import { editsCars, editsPapers, type Role } from "@/lib/roles";

/** One sentence at the top of a main page that says what THIS person does there, so nobody has to guess where to look. */
export function pageNote(page: "documents" | "cars" | "repairs", role: Role): string {
  if (page === "documents") {
    if (role === "documentation") return "Your part here: every tab. Check the IN and OUT documents, and do the transfer of the originals on the Sale and transfer tab (hand them to Sir Jep, take them back, release them to the buyer).";
    if (editsPapers(role)) return "Your part here: the IN documents. Add a car from the menu, or open one, upload photos of the papers it came with, check what the bot found, then approve. Sales add the OUT documents after a sale; everyone can read them.";
    if (role === "sales") return "Your part here: read any car's IN documents (the papers it came with). After you sell a car, open it and add its OUT documents on the OUT documents tab: the signed AR, the buyer's ID, the deed and the payment papers.";
    return "Every car's documents, for you to read as a reference. Open a car to see its papers and photos.";
  }
  if (page === "cars") return editsCars(role) ? "The price list. Open a car and use Change price or state to update it." : "The price list, for you to read. Open a car to see its details.";
  return editsCars(role) ? "You can approve or reject a repair report and update a job. Say on the approval whether the car can still be displayed." : "Every repair report on the cars, for you to read.";
}
