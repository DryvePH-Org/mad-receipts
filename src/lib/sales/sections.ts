// One sale, one record (a sale and its transfer are one row of car_sales), told in the same sections with the same names on every screen: the car's
// Sale and transfer tab, the Overview, Payments and the list of transfers. Pure.

export type SaleSectionId = "sale" | "payment" | "transfer" | "originals" | "notes";

export const SALE_FIELD_NAME: Record<string, string> = {
  buyer: "Buyer", address: "Buyer's address", contact: "Buyer's number", soldOn: "Sold on", agreedPrice: "Agreed price", sales: "Salesperson", financing: "Financing company",
  paymentStatus: "Payment", balance: "Balance",
  route: "Who does the transfer", stage: "Stage", liaison: "Liaison", particular: "Work to do", crDate: "CR date", transactionDate: "Transaction date", nextStep: "Next step",
  originalsAt: "Originals now with", handedOffAt: "Sent to the liaison", backAt: "Back at MAD", releasedOn: "Released on", deliveredOn: "Delivered on", doneOn: "Finished on",
  note: "Note",
};

export const SALE_SECTIONS: { id: SaleSectionId; title: string; keys: string[] }[] = [
  { id: "sale", title: "Sale", keys: ["buyer", "address", "contact", "soldOn", "agreedPrice", "sales", "financing"] },
  { id: "payment", title: "Payment", keys: ["paymentStatus", "balance"] },
  { id: "transfer", title: "Transfer", keys: ["route", "stage", "liaison", "particular", "crDate", "transactionDate", "nextStep"] },
  { id: "originals", title: "The originals", keys: ["originalsAt", "handedOffAt", "backAt", "releasedOn", "deliveredOn", "doneOn"] },
  { id: "notes", title: "Notes", keys: ["note"] },
];
