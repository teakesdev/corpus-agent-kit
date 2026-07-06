/**
 * Corpus widget loader — the only file host pages reference:
 *   <script async src="https://<corpus-host>/widget/widget.js"
 *           data-corpus-key="pk_…"></script>
 *
 * Stays tiny (≤2 KB gz): reads config off its own script tag, mounts a
 * launcher button in a closed shadow root, and lazy-loads the real app
 * bundle on first click. data-corpus-origin overrides the API origin
 * (defaults to the script's own origin).
 */
(() => {
  type AppModule = typeof import("./app");

  const script = document.currentScript as HTMLScriptElement | null;
  const src = script?.src ?? "";
  const key = script?.dataset.corpusKey ?? "";
  const apiOrigin = script?.dataset.corpusOrigin ?? (src ? new URL(src).origin : "");
  if (!key || !apiOrigin || document.querySelector("corpus-widget")) {
    if (script && (!key || !apiOrigin)) {
      console.warn("[corpus-widget] missing data-corpus-key or script origin");
    }
    return;
  }

  const init = () => {
    if (document.querySelector("corpus-widget")) return;
    if (!customElements.get("corpus-widget")) {
      customElements.define("corpus-widget", class extends HTMLElement {});
    }
    const host = document.createElement("corpus-widget");
    document.body.appendChild(host);
    const root = host.attachShadow({ mode: "closed" });

    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Ask about city services";
    btn.setAttribute("aria-haspopup", "dialog");
    btn.style.cssText =
      "position:fixed;right:20px;bottom:20px;z-index:2147483000;" +
      "padding:12px 18px;border:0;border-radius:24px;cursor:pointer;" +
      "background:#1a365d;color:#fff;font:600 14px system-ui,sans-serif;" +
      "box-shadow:0 4px 14px rgba(0,0,0,.25);" +
      "letter-spacing:normal;text-transform:none;";
    root.appendChild(btn);

    let loading = false;
    btn.addEventListener("click", () => {
      if (loading) return;
      loading = true;
      btn.textContent = "Loading…";
      import(new URL("/widget/widget-app.js", apiOrigin).href)
        .then((mod: AppModule) => {
          btn.remove();
          mod.mount(root, { key, apiOrigin });
        })
        .catch((err) => {
          console.warn("[corpus-widget] failed to load widget app", err);
          loading = false;
          btn.textContent = "Ask about city services";
        });
    });
  };

  if (document.body) init();
  else document.addEventListener("DOMContentLoaded", init);
})();
