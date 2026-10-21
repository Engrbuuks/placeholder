// Where a lead came from: the page they were on, the site that sent them, and any campaign tags in the link.
export type Attribution = {
  source?: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  landingPage?: string | null;
  referrer?: string | null;
};

const clean = (v: string | null | undefined, max = 120) => (v ?? "").trim().slice(0, max) || null;

/** Reads utm_source, utm_medium and utm_campaign from the page address, and guesses the source from the referrer. */
export function attributionFromPage(page: string | null | undefined, referrer: string | null | undefined): Attribution {
  let url: URL | null = null;
  try {
    url = page ? new URL(page) : null;
  } catch {
    url = null;
  }
  if (url && !/^https?:$/.test(url.protocol)) url = null;
  let ref: URL | null = null;
  try {
    ref = referrer ? new URL(referrer) : null;
  } catch {
    ref = null;
  }
  const p = url?.searchParams;
  let utmSource = clean(p?.get("utm_source"));
  let utmMedium = clean(p?.get("utm_medium"));
  // Ad clicks carry an id even when the advertiser forgot the utm tags.
  if (!utmSource && p?.get("gclid")) [utmSource, utmMedium] = ["google", "cpc"];
  if (!utmSource && p?.get("fbclid")) [utmSource, utmMedium] = ["facebook", utmMedium ?? "social"];
  if (!utmSource && ref && url && ref.hostname !== url.hostname) {
    const host = ref.hostname.replace(/^www\./, "");
    utmSource = /google\./.test(host) ? "google" : /facebook\.com|fb\.com/.test(host) ? "facebook" : /instagram\.com/.test(host) ? "instagram" : host;
    utmMedium = utmMedium ?? (/google\.|bing\.|duckduckgo\./.test(host) ? "organic" : "referral");
  }
  return {
    utmSource,
    utmMedium,
    utmCampaign: clean(p?.get("utm_campaign")),
    landingPage: url ? clean(`${url.origin}${url.pathname}`, 500) : null,
    referrer: ref ? clean(ref.origin, 300) : null,
  };
}

/** The label a person reads for a lead's source, for example "Google (cpc)" or "Web chat". */
export function sourceLabel(row: { source: string | null; utm_source: string | null; utm_medium: string | null }): string {
  const base = { webchat: "Web chat", whatsapp: "WhatsApp", sms: "SMS", form: "Lead form", missed_call: "Missed call", booking: "Booking page", email: "Email" }[row.source ?? ""] ?? "Other";
  if (!row.utm_source) return base;
  const name = row.utm_source.charAt(0).toUpperCase() + row.utm_source.slice(1);
  return row.utm_medium ? `${name} (${row.utm_medium})` : name;
}
