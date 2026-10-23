// Turns the landing page into plain files for GitHub Pages.
//
// It reads the page from a running copy of the app, removes the app's scripts (the landing page needs none),
// copies the stylesheets and pictures it uses, and makes every path relative, so the page works under
// https://<user>.github.io/<repo>/. Sign up and log in buttons point at the live app when APP_URL is given;
// until then they lead to the sample check further down the page, and the log in link is left out.
//
// Usage: node scripts/export_landing.mjs <running app url> <output folder> <pages url> [live app url]
import { mkdir, writeFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

const [source, out, pagesUrl, appUrlArg] = process.argv.slice(2);
if (!source || !out || !pagesUrl) {
  console.error("Usage: node scripts/export_landing.mjs <running app url> <output folder> <pages url> [live app url]");
  process.exit(1);
}
const from = source.replace(/\/$/, "");
const pages = pagesUrl.replace(/\/$/, "");
const app = (appUrlArg || "").replace(/\/$/, "");

const response = await fetch(`${from}/`);
if (!response.ok) throw new Error(`The landing page answered ${response.status}`);
let html = await response.text();

// The page works without the app's scripts: no part of it is interactive.
html = html
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
  .replace(/<link\b[^>]*rel="(?:preload|modulepreload)"[^>]*as="script"[^>]*\/?>/gi, "")
  .replace(/<link\b[^>]*as="script"[^>]*rel="(?:preload|modulepreload)"[^>]*\/?>/gi, "");

// Absolute links the app wrote for itself (the link preview image) now point at the Pages address.
const origin = new URL(from).origin;
html = html.split(`${origin}/`).join(`${pages}/`).split("http://localhost:3000/").join(`${pages}/`);

// Buttons into the app.
const appLink = (path) => (app ? `${app}${path}` : "#check");
html = html.replace(/href="\/signup"/g, `href="${appLink("/signup")}"`);
html = app
  ? html.replace(/href="\/login"/g, `href="${appLink("/login")}"`)
  : html.replace(/<a\b[^>]*href="\/login"[^>]*>[\s\S]*?<\/a>/gi, "");
html = html.replace(/href="\/"/g, 'href="./"').replace(/href="\/#/g, 'href="#');

// Every remaining file the page asks for is copied and linked relatively.
const assets = new Set();
html = html.replace(/(href|src)="\/([^"#?][^"]*)"/g, (_, attr, path) => {
  assets.add(path);
  return `${attr}="${path}"`;
});
html = html.replace(/srcset="([^"]+)"/gi, (_, list) =>
  `srcset="${list
    .split(",")
    .map((part) => {
      const [url, size] = part.trim().split(/\s+/);
      if (url.startsWith("/")) {
        assets.add(url.slice(1));
        return `${url.slice(1)} ${size ?? ""}`.trim();
      }
      return part.trim();
    })
    .join(", ")}"`,
);

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const path of assets) {
  const file = await fetch(`${from}/${path}`);
  if (!file.ok) throw new Error(`Could not copy /${path}: ${file.status}`);
  const target = join(out, decodeURIComponent(path));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(await file.arrayBuffer()));
}
// The link preview image is not referenced by the page body, but sharing sites fetch it.
for (const path of ["illustrations/og.jpg"]) {
  const file = await fetch(`${from}/${path}`);
  if (file.ok) {
    await mkdir(join(out, "illustrations"), { recursive: true });
    await writeFile(join(out, path), Buffer.from(await file.arrayBuffer()));
  }
}
await writeFile(join(out, "index.html"), html);
// Folders starting with an underscore (_next) are hidden by GitHub's default site builder unless this file exists.
await writeFile(join(out, ".nojekyll"), "");
console.log(`Exported the landing page with ${assets.size} files to ${out}${app ? `, linking to ${app}` : ", with sign up buttons leading to the sample check"}`);
