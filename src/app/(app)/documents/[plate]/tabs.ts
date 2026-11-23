// The car's page has six tabs. A link to a part of the page (an anchor) knows which tab holds it.

export type CarTab = "overview" | "documents" | "payments" | "sale" | "receipts" | "details";
export const TAB_LABEL: Record<CarTab, string> = { overview: "Overview", documents: "Documents", payments: "Payments", sale: "Sale and transfer", receipts: "Receipts", details: "Details" };

/** Which tab holds each part of the page. */
export const TAB_OF_ANCHOR: Record<string, CarTab> = {
  folder: "documents", files: "documents", papers: "documents", approval: "documents", sold: "documents", "sold-upload": "documents", about: "details", register: "details", "remove-car": "details",
  handoff: "sale", transfer: "sale", receipts: "receipts", payments: "payments", "add-sale": "payments",
};

export const isTab = (v: unknown): v is CarTab => typeof v === "string" && v in TAB_LABEL;
export const carHref = (plate: string, tab: CarTab, anchor?: string) => `/documents/${plate}?tab=${tab}${anchor ? `#${anchor}` : ""}`;
export const hrefOfAnchor = (plate: string, anchor: string | null) => (anchor && TAB_OF_ANCHOR[anchor] ? carHref(plate, TAB_OF_ANCHOR[anchor], anchor) : carHref(plate, "documents"));
