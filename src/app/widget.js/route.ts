// The one line embed for a business's own website:
//   <script src="https://YOUR-APP/widget.js" data-key="WIDGET_KEY" async></script>
// It adds a chat button that opens the chat in a frame served from this app.
import { automationConfig } from "@/lib/config";

export const dynamic = "force-static";

const label = JSON.stringify(automationConfig.webchat.launcherLabel);

const script = `(function () {
  var s = document.currentScript;
  if (!s || window.__placeholderChat) return;
  window.__placeholderChat = true;
  var key = s.getAttribute("data-key");
  if (!key || !/^[A-Za-z0-9_-]{8,64}$/.test(key)) return;
  var origin = new URL(s.src).origin;
  var open = false;

  var frame = document.createElement("iframe");
  frame.src = origin + "/chat/" + encodeURIComponent(key);
  frame.title = ${label};
  frame.style.cssText = "position:fixed;right:16px;bottom:84px;width:min(380px,calc(100vw - 32px));height:min(600px,calc(100vh - 110px));border:0;border-radius:18px;box-shadow:0 16px 48px rgba(17,17,17,.18);z-index:2147483646;display:none;background:#fff";

  var button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-expanded", "false");
  button.textContent = ${label};
  button.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;border:0;border-radius:999px;padding:14px 20px;background:#ff5a14;color:#fff;font:600 15px/1 system-ui,sans-serif;cursor:pointer;box-shadow:0 8px 24px rgba(255,90,20,.35)";
  button.addEventListener("click", function () {
    open = !open;
    frame.style.display = open ? "block" : "none";
    button.setAttribute("aria-expanded", String(open));
    button.textContent = open ? "Close" : ${label};
  });

  document.body.appendChild(frame);
  document.body.appendChild(button);
})();
`;

export function GET() {
  return new Response(script, {
    headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
