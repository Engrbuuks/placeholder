// Phone numbers as people type them, turned into international form.
import { markets } from "./config";

/**
 * Turns what people type ("0803 123 4567", "(312) 555-0100", "+44 7700 900123") into international form,
 * using the business's own country code. Returns null when it cannot be a real number.
 */
export function normalisePhone(raw: string, country: string | null): string | null {
  let digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  const prefix = country ? markets[country]?.phonePrefix : undefined;
  if (!digits.startsWith("+")) {
    if (!prefix) return null;
    const national = digits.replace(/^0+/, "");
    // In North America the national number already starts after the 1.
    digits = prefix === "+1" && national.length === 11 && national.startsWith("1") ? `+${national}` : `${prefix}${national}`;
  }
  return /^\+[1-9]\d{7,14}$/.test(digits) ? digits : null;
}
