// Reads facts from a page's HTML. Pure and synchronous, so it is easy to test with saved pages.
import * as cheerio from "cheerio";
import type { AuditConfig } from "../config";

export type SchemaBusiness = {
  name?: string;
  telephone?: string;
  email?: string;
  address?: string;
  openingHours?: string;
  description?: string;
};

export type PageFacts = {
  fetched: boolean;
  error?: string;
  finalUrl?: string;
  https?: boolean;
  status?: number;
  responseMs?: number;
  bytes?: number;
  title?: string;
  description?: string;
  viewport?: boolean;
  whatsappNumbers?: string[];
  phoneNumbers?: string[];
  emails?: string[];
  bookingCta?: boolean;
  hasForm?: boolean;
  schemaTypes?: string[];
  schemaBusiness?: SchemaBusiness;
  socialLinks?: string[];
  mapsLink?: string;
  hasReviews?: boolean;
  analytics?: boolean;
  ogImage?: boolean;
  siteName?: string;
  headings?: string[];
};

export type AnalyzedPage = { facts: PageFacts; text: string };

const clean = (s: string | undefined | null) => (s ?? "").replace(/\s+/g, " ").trim();

function unique(values: string[], limit = 10): string[] {
  return [...new Set(values.filter(Boolean))].slice(0, limit);
}

function whatsappNumber(href: string): string | null {
  try {
    const url = new URL(href);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "wa.me") return url.pathname.replace(/\D/g, "") || "linked";
    if (host === "api.whatsapp.com" || host === "web.whatsapp.com" || host === "whatsapp.com") {
      return (url.searchParams.get("phone") ?? "").replace(/\D/g, "") || "linked";
    }
  } catch {
    if (href.startsWith("whatsapp://")) return href.replace(/\D/g, "") || "linked";
  }
  return null;
}

function addressText(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return clean(value);
  if (typeof value === "object") {
    const a = value as Record<string, unknown>;
    return clean(
      [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode, a.addressCountry]
        .filter((p) => typeof p === "string")
        .join(", "),
    );
  }
  return undefined;
}

function hoursText(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return clean(value);
  if (Array.isArray(value)) return clean(value.filter((v) => typeof v === "string").join("; ")) || undefined;
  return undefined;
}

function collectSchema(nodes: unknown, types: string[], business: SchemaBusiness) {
  if (!nodes || typeof nodes !== "object") return;
  if (Array.isArray(nodes)) {
    for (const n of nodes) collectSchema(n, types, business);
    return;
  }
  const node = nodes as Record<string, unknown>;
  if (node["@graph"]) collectSchema(node["@graph"], types, business);
  const rawType = node["@type"];
  const typeList = (Array.isArray(rawType) ? rawType : [rawType]).filter((t): t is string => typeof t === "string");
  types.push(...typeList);
  const isBusiness = typeList.some((t) => !["WebSite", "WebPage", "BreadcrumbList", "ImageObject", "SearchAction"].includes(t));
  if (isBusiness) {
    if (!business.name && typeof node.name === "string") business.name = clean(node.name);
    if (!business.telephone && typeof node.telephone === "string") business.telephone = clean(node.telephone);
    if (!business.email && typeof node.email === "string") business.email = clean(node.email);
    if (!business.description && typeof node.description === "string") business.description = clean(node.description);
    if (!business.address) business.address = addressText(node.address);
    if (!business.openingHours) business.openingHours = hoursText(node.openingHours);
  }
}

export function analyzeHtml(
  html: string,
  meta: { finalUrl: string; status: number; responseMs: number; bytes: number },
  keywords: AuditConfig["keywords"],
): AnalyzedPage {
  const $ = cheerio.load(html);

  const hrefs = $("a[href]")
    .map((_, el) => clean($(el).attr("href")))
    .get();
  const lowerHtml = html.toLowerCase();

  const whatsappNumbers = unique(hrefs.map(whatsappNumber).filter((n): n is string => n !== null));
  const phoneNumbers = unique(
    hrefs.filter((h) => h.toLowerCase().startsWith("tel:")).map((h) => decodeURIComponent(h.slice(4)).replace(/[^\d+]/g, "")),
  );
  const emails = unique(
    hrefs.filter((h) => h.toLowerCase().startsWith("mailto:")).map((h) => decodeURIComponent(h.slice(7)).split("?")[0]),
  );

  const actionTexts = $("a, button, input[type=submit]")
    .map((_, el) => clean($(el).text() || $(el).attr("value") || $(el).attr("aria-label")).toLowerCase())
    .get()
    .filter((t) => t.length > 0 && t.length < 80);
  const bookingCta = actionTexts.some((t) => keywords.booking.some((k) => t.includes(k)));

  const schemaTypes: string[] = [];
  const schemaBusiness: SchemaBusiness = {};
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      collectSchema(JSON.parse($(el).contents().text()), schemaTypes, schemaBusiness);
    } catch {
      // Broken structured data is treated as absent.
    }
  });

  const lowerHrefs = hrefs.map((h) => h.toLowerCase());
  const socialLinks = unique(hrefs.filter((h, i) => keywords.social.some((k) => lowerHrefs[i].includes(k))));
  const mapsLink = hrefs.find((h, i) => keywords.maps.some((k) => lowerHrefs[i].includes(k)));
  const mapsEmbed = $('iframe[src*="google.com/maps"]').length > 0;

  $("script, style, noscript, svg").remove();
  const text = clean($("body").text()).slice(0, 20000);
  const lowerText = text.toLowerCase();

  const facts: PageFacts = {
    fetched: true,
    finalUrl: meta.finalUrl,
    https: meta.finalUrl.startsWith("https://"),
    status: meta.status,
    responseMs: meta.responseMs,
    bytes: meta.bytes,
    title: clean($("title").first().text()).slice(0, 300),
    description: clean($('meta[name="description"]').attr("content")).slice(0, 500),
    viewport: /width\s*=\s*device-width/i.test($('meta[name="viewport"]').attr("content") ?? ""),
    whatsappNumbers,
    phoneNumbers,
    emails,
    bookingCta,
    hasForm: $("form").filter((_, f) => $(f).find("input, textarea").length >= 2).length > 0,
    schemaTypes: unique(schemaTypes, 20),
    schemaBusiness,
    socialLinks,
    mapsLink: mapsLink ?? (mapsEmbed ? "embedded map" : undefined),
    hasReviews: keywords.reviews.some((k) => lowerText.includes(k)),
    analytics: keywords.analytics.some((k) => lowerHtml.includes(k)),
    ogImage: Boolean(clean($('meta[property="og:image"]').attr("content"))),
    siteName: clean($('meta[property="og:site_name"]').attr("content")).slice(0, 200) || undefined,
    headings: unique(
      $("h1, h2, h3")
        .map((_, el) => clean($(el).text()))
        .get()
        .filter((h) => h.length > 2 && h.length <= 80),
      30,
    ),
  };
  return { facts, text };
}
