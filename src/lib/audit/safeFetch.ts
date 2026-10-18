// Fetches a public web page for the audit without letting a user aim our server at internal addresses.
// Every connection, including each redirect, resolves the host and refuses private, loopback,
// link local and other non public ranges. Only http and https on default ports are allowed.
import dns from "node:dns";
import net from "node:net";
import { Agent, fetch } from "undici";

const blocked = new net.BlockList();
for (const [range, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(range, bits, "ipv4");
}
for (const [range, bits] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(range, bits, "ipv6");
}

export function isPublicAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return !blocked.check(address, "ipv4");
  if (family === 6) {
    // An IPv4 address written inside IPv6 (::ffff:a.b.c.d or ::ffff:7f00:1) is judged by the IPv4 rules.
    const compact = new URL(`http://[${address}]`).hostname.slice(1, -1).toLowerCase();
    const dotted = compact.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (dotted) return !blocked.check(dotted[1], "ipv4");
    const hex = compact.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
      const hi = parseInt(hex[1], 16);
      const lo = parseInt(hex[2], 16);
      return !blocked.check(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`, "ipv4");
    }
    if (compact.startsWith("::ffff:")) return false;
    return !blocked.check(address, "ipv6");
  }
  return false;
}

export class BlockedAddressError extends Error {
  constructor(message = "That address is not a public website.") {
    super(message);
    this.name = "BlockedAddressError";
  }
}

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | dns.LookupAddress[],
  family?: number,
) => void;

export function safeLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback) {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, []);
    const list = addresses as dns.LookupAddress[];
    if (list.length === 0 || list.some((a) => !isPublicAddress(a.address))) {
      return callback(new BlockedAddressError(), []);
    }
    if (options.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}

const agent = new Agent({
  connect: { lookup: safeLookup as never, timeout: 5000 },
});

/** Throws if a URL is not something we are willing to fetch. Returns the normalised URL. */
export function assertFetchableUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedAddressError("That does not look like a web address.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BlockedAddressError("Only http and https web addresses can be checked.");
  }
  if (url.username || url.password) throw new BlockedAddressError("Web addresses with passwords are not allowed.");
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new BlockedAddressError("Only standard web ports can be checked.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host) && !isPublicAddress(host)) throw new BlockedAddressError();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new BlockedAddressError();
  }
  return url;
}

export type FetchedPage = {
  finalUrl: string;
  status: number;
  responseMs: number;
  bytes: number;
  truncated: boolean;
  html: string;
};

export async function fetchPublicPage(
  raw: string,
  opts: { timeoutMs: number; maxBytes: number; maxRedirects: number; userAgent: string },
): Promise<FetchedPage> {
  let url = assertFetchableUrl(raw);
  const deadline = AbortSignal.timeout(opts.timeoutMs);
  const started = performance.now();

  for (let hop = 0; hop <= opts.maxRedirects; hop++) {
    const response = await fetch(url, {
      dispatcher: agent,
      redirect: "manual",
      signal: deadline,
      headers: { "user-agent": opts.userAgent, accept: "text/html,application/xhtml+xml" },
    });
    const responseMs = Math.round(performance.now() - started);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new Error("The website sent a redirect without a destination.");
      url = assertFetchableUrl(new URL(location, url).toString());
      continue;
    }

    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("html")) {
      await response.body?.cancel();
      throw new Error("That address did not return a web page.");
    }

    const chunks: Uint8Array[] = [];
    let bytes = 0;
    let truncated = false;
    if (response.body) {
      for await (const chunk of response.body) {
        bytes += chunk.byteLength;
        if (bytes > opts.maxBytes) {
          truncated = true;
          break;
        }
        chunks.push(chunk);
      }
    }
    const html = Buffer.concat(chunks).toString("utf8");
    return { finalUrl: url.toString(), status: response.status, responseMs, bytes, truncated, html };
  }
  throw new Error("The website redirected too many times.");
}
