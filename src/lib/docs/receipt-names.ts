// How a receipt copy is named in a car's Drive folder. Names that start with RECEIPT- are never scanned as car documents.
export const RECEIPT_FILE_PREFIX = "RECEIPT-";
export const receiptFileBase = (receiptNo: string, plate: string) => `${RECEIPT_FILE_PREFIX}${receiptNo.replace(/[^\w-]+/g, "")}_${plate.toUpperCase().replace(/[^A-Z0-9]/g, "")}`;
export const isReceiptFile = (name: string) => name.toUpperCase().startsWith(RECEIPT_FILE_PREFIX);

/** The receipt the app makes is NOT signed: the signed paper is photographed and uploaded by Sales (it becomes the AR on the checklist). The name says so. */
export const UNSIGNED_SUFFIX = "_UNSIGNED";
export const receiptCopyName = (receiptNo: string, plate: string) => `${receiptFileBase(receiptNo, plate)}${UNSIGNED_SUFFIX}.html`;
/** Copies filed before the mark existed have the plain name: they count as filed too (and are known to be unsigned all the same). */
export const receiptCopyNames = (receiptNo: string, plate: string) => [receiptCopyName(receiptNo, plate), `${receiptFileBase(receiptNo, plate)}.html`];
