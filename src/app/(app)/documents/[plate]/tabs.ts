// The car's page has six tabs. A link to a part of the page (an anchor) knows which tab holds it.

export type CarTab = "overview" | "documents" | "payments" | "sale" | "receipts" | "details";
export const TAB_LABEL: Record<CarTab, string> = { overview: "Overview", documents: "IN documents", payments: "OUT documents", sale: "Sale and transfer", receipts: "Receipts", details: "Details" };

/** Which tab holds each part of the page. */
export const TAB_OF_ANCHOR: Record<string, CarTab> = {
  folder: "documents", files: "documents", papers: "documents", approval: "documents", sold: "documents", "sold-upload": "payments", about: "details", register: "details", "remove-car": "details",
  handoff: "sale", transfer: "sale", receipts: "receipts", payments: "payments", "add-sale": "payments",
};

export const isTab = (v: unknown): v is CarTab => typeof v === "string" && v in TAB_LABEL;
export const carHref = (plate: string, tab: CarTab, anchor?: string) => `/documents/${plate}?tab=${tab}${anchor ? `#${anchor}` : ""}`;
export const hrefOfAnchor = (plate: string, anchor: string | null) => (anchor && TAB_OF_ANCHOR[anchor] ? carHref(plate, TAB_OF_ANCHOR[anchor], anchor) : carHref(plate, "documents"));

/**
 * One line at the top of each tab that says what the tab is and what THIS person does in it, so nobody has to guess where to look.
 * IN documents: the papers the car came with (Buying uploads and checks them; everyone else reads). OUT documents: after the sale (Sales upload them).
 */
export function tabHint(tab: CarTab, who: { editsIn: boolean; editsOut: boolean; seesSales: boolean }): string {
  switch (tab) {
    case "overview": return who.editsIn ? "Where this car stands and the next step. IN documents are the papers the car came with; OUT documents are the papers after the sale." : who.editsOut ? "Where this car stands. After you sell it, add the OUT documents (the signed AR, the buyer's ID, the deed and the payment papers); the IN documents are there for you to read." : "Where this car stands. The IN documents are the papers the car came with, for you to read.";
    case "documents": return who.editsIn ? "IN documents: upload photos of the papers the car came with, scan them, check what the bot found, then approve. Sales and Online Marketing read them as a reference." : "IN documents: the papers the car came with, for you to read. Buying uploads and checks them.";
    case "payments": return who.editsOut ? "OUT documents, after the sale: upload the signed AR first (the sale fills in from it), then the buyer's ID and the deed, then the payment papers." : "OUT documents, after the sale: the signed AR, the buyer's ID, the deed and the payment papers.";
    case "sale": return "The sale record of this car and the transfer of the originals (OR/CR) to the buyer.";
    case "receipts": return "Receipts made in the app for this car (not used for now).";
    case "details": return who.editsIn ? "About the car (which owner, keys, battery, where it was bought), its record in the register, and its repairs." : "About the car, its record in the register and its repairs.";
  }
}
