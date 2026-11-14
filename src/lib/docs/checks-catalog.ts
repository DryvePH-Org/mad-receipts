// What the document scan does, in plain words, for the "What the scan checks" card. The bot only READS each photo; the red flags come from the
// app comparing what was read (analyze.ts, details.ts).

export interface CheckInfo { title: string; detail: string }

export const CHECKS_BY_BOT: CheckInfo[] = [
  { title: "What the document is", detail: "official receipt, certificate of registration, an ID, the deed of sale, the chattel mortgage cancellation, the promissory note, the secretary's certificate, the board resolution, the acknowledgement of payment or the transmittal receipt; and how sure it is." },
  { title: "How the photo is turned", detail: "sideways or upside down photos are read the right way up, and shown upright here (the file in Drive is not changed)." },
  { title: "Original or photocopy", detail: "a xerox or black-and-white copy is told apart from the paper itself." },
  { title: "Damage it can see", detail: "torn, cut off, blurry, glare, stained, folded, missing signature, missing stamp, altered or written over, partly covered." },
  { title: "The numbers and names", detail: "the document number, the plate, the motor and chassis numbers, the registered owner, the name on an ID, the seller and the buyer on a deed, the secretary and the representative, the type of ID; for an official receipt the date it is valid until, and for a chattel mortgage or promissory note the bank or lender. What cannot be read in full is left blank, never guessed." },
];

export const CHECKS_BY_APP: CheckInfo[] = [
  { title: "Wrong plate", detail: "the plate on a paper differs from the plate of this car's folder." },
  { title: "Motor or chassis number differs", detail: "the number on one paper is not the number on another (small misreads are tolerated, a different car's number is not)." },
  { title: "Seller is not the owner", detail: "the seller on the deed is not the registered owner on the certificate of registration." },
  { title: "An ID nobody owns", detail: "the name on an ID is not the owner, the secretary, the representative or the buyer on file." },
  { title: "A deed between the wrong people", detail: "the buyer on a deed is neither the dealership nor the buyer of this deal." },
  { title: "Photocopy where the original is needed", detail: "a photocopy of the official receipt, the certificate of registration, a deed, the chattel mortgage cancellation, the secretary's certificate or the board resolution (a photocopied ID is fine)." },
  { title: "Damage", detail: "any damage the bot saw on a paper." },
  { title: "Two photos of one document", detail: "the same document number, or the same person's ID, twice." },
  { title: "Not read", detail: "a photo that failed, or is too unclear to read." },
  { title: "Not sure", detail: "the bot is less than 60% sure what a paper is." },
  { title: "Missing papers", detail: "a paper the car's case needs is not in the folder (Clean, Encumbered, Repo or Company each need their own list)." },
];
