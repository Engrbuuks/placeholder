// What the market, time zone and language pickers show. Built on the server from config/markets.json.
import { currencySymbol, formatMoney, locales, markets } from "./config";

export type MarketOption = {
  code: string;
  name: string;
  detail: string;
  smsNote: string;
  timeZones: { value: string; label: string }[];
  languages: { value: string; label: string }[];
};

/** "America/New_York" becomes "New York (GMT-4)", with the offset as it is today. */
export function timeZoneLabel(zone: string, now = new Date()): string {
  const city = zone.split("/").pop()!.replaceAll("_", " ");
  const offset = new Intl.DateTimeFormat("en-GB", { timeZone: zone, timeZoneName: "shortOffset" })
    .formatToParts(now)
    .find((p) => p.type === "timeZoneName")?.value;
  return offset ? `${city} (${offset})` : city;
}

export function marketOptions(): MarketOption[] {
  return Object.entries(markets)
    .map(([code, m]) => ({
      code,
      name: m.name,
      detail: `Prices in ${currencySymbol(code)} (${m.currency}), payments through ${m.paymentProvider}, ${m.dataLaw}.`,
      smsNote: m.smsNote,
      timeZones: m.timeZones.map((z) => ({ value: z, label: timeZoneLabel(z) })),
      languages: m.languages.map((l) => ({ value: l, label: locales[l].name })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// A believable consultation price per currency, only for form examples. Anything not listed gets 50 units.
const sampleConsultation: Record<string, number> = { NGN: 15000, INR: 1500, KES: 2500, GHS: 300, ZAR: 650, MXN: 900, BRL: 250, AED: 300 };

export function exampleConsultationPrice(code: string | null | undefined): string {
  const currency = code ? markets[code]?.currency : undefined;
  return currency ? formatMoney(sampleConsultation[currency] ?? 50, code) : "45";
}
