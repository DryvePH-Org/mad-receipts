// How a receipt copy is named in a car's Drive folder. Names that start with RECEIPT- are never scanned as car documents.
export const RECEIPT_FILE_PREFIX = "RECEIPT-";
export const receiptFileBase = (receiptNo: string, plate: string) => `${RECEIPT_FILE_PREFIX}${receiptNo.replace(/[^\w-]+/g, "")}_${plate.toUpperCase().replace(/[^A-Z0-9]/g, "")}`;
export const isReceiptFile = (name: string) => name.toUpperCase().startsWith(RECEIPT_FILE_PREFIX);
