/** Plates are the inventory key: uppercase letters and digits only ("nkf-4771" → "NKF4771"). */
export function normalizePlate(plate: string | null | undefined): string {
  return (plate ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
