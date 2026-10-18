// Turns what owners type ("mybiz.com", "@mybiz") into clean web addresses, or reports a clear problem.

export type UrlResult = { ok: true; value: string | null } | { ok: false; error: string };

export function normaliseWebsite(input: string): UrlResult {
  const raw = input.trim();
  if (!raw) return { ok: true, value: null };
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname.includes(".")) return { ok: false, error: "Enter your full website address, for example mybusiness.com." };
    url.hash = "";
    return { ok: true, value: url.toString() };
  } catch {
    return { ok: false, error: "That website address does not look right. Try something like mybusiness.com." };
  }
}

export function normaliseInstagram(input: string): UrlResult {
  const raw = input.trim();
  if (!raw) return { ok: true, value: null };
  const handle = raw
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0];
  if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) {
    return { ok: false, error: "Enter your Instagram handle, for example @mybusiness." };
  }
  return { ok: true, value: `https://instagram.com/${handle}` };
}

export function normaliseGoogleProfile(input: string): UrlResult {
  const raw = input.trim();
  if (!raw) return { ok: true, value: null };
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    const host = url.hostname.replace(/^www\./, "");
    const google = ["google.com", "maps.google.com", "g.page", "maps.app.goo.gl", "goo.gl", "g.co"];
    if (!google.some((g) => host === g || host.endsWith(`.${g}`) || host.startsWith("google."))) {
      return { ok: false, error: "Paste the share link from your Google Business Profile or Google Maps listing." };
    }
    return { ok: true, value: url.toString() };
  } catch {
    return { ok: false, error: "Paste the share link from your Google Business Profile or Google Maps listing." };
  }
}
