/**
 * Corpus widget chat panel. Mounted by the loader into a closed shadow root —
 * all styles are scoped here; nothing leaks to or from the host page.
 */
import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { Citation, ChatMessage } from "./types";
import { readNdjson } from "./stream";

export interface WidgetConfig {
  key: string;
  apiOrigin: string;
}

interface Turn {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
}

const FALLBACK =
  "Sorry — I couldn't answer that right now. Please try again in a moment, or contact City Hall directly.";
const RATE_LIMITED =
  "I'm getting a lot of questions right now. Please try again in a few minutes, or contact City Hall directly.";
const NOT_CONFIGURED = "This assistant isn't configured for this website.";

const CSS = `
  .panel{position:fixed;right:20px;bottom:20px;z-index:2147483000;width:min(380px,calc(100vw - 40px));
    height:min(560px,calc(100vh - 40px));display:flex;flex-direction:column;background:#fff;color:#1a202c;
    border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.3);font:14px/1.45 system-ui,sans-serif;overflow:hidden;
    letter-spacing:normal;text-transform:none;text-align:left}
  .head{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#1a365d;color:#fff}
  .head h2{font-size:15px;font-weight:600;margin:0}
  .head button{background:none;border:0;color:#fff;font-size:20px;cursor:pointer;line-height:1;padding:4px}
  .log{flex:1;overflow-y:auto;padding:12px 16px;display:flex;flex-direction:column;gap:10px}
  .msg{max-width:88%;padding:8px 12px;border-radius:10px;white-space:pre-wrap;overflow-wrap:break-word}
  .user{align-self:flex-end;background:#1a365d;color:#fff}
  .bot{align-self:flex-start;background:#edf2f7}
  .cites{font-size:12px;margin-top:6px}
  .cites a{color:#2b6cb0;text-decoration:underline;display:block}
  .form{display:flex;gap:8px;padding:10px 12px;border-top:1px solid #e2e8f0}
  .form input{flex:1;padding:9px 12px;border:1px solid #cbd5e0;border-radius:8px;font:inherit;min-width:0}
  .form button{padding:9px 14px;border:0;border-radius:8px;background:#1a365d;color:#fff;font:600 14px system-ui,sans-serif;cursor:pointer}
  .form button:disabled{opacity:.5;cursor:default}
  .foot{padding:7px 12px;background:#f7fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#718096;text-align:center}
  .launch{position:fixed;right:20px;bottom:20px;z-index:2147483000;padding:12px 18px;border:0;border-radius:24px;
    cursor:pointer;background:#1a365d;color:#fff;font:600 14px system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);
    letter-spacing:normal;text-transform:none}
`;

export function mount(root: ShadowRoot, cfg: WidgetConfig): void {
  const style = document.createElement("style");
  style.textContent = CSS;
  root.appendChild(style);
  const el = document.createElement("div");
  root.appendChild(el);
  render(<Panel cfg={cfg} />, el);
}

function Panel({ cfg }: { cfg: WidgetConfig }) {
  const [open, setOpen] = useState(true);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const launchRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else launchRef.current?.focus();
  }, [open]);

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") setOpen(false);
  }

  function scrollLog() {
    requestAnimationFrame(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    });
  }

  async function queryOnce(history: ChatMessage[], question: string): Promise<Turn> {
    setDraft("");
    const res = await fetch(new URL("/api/widget/query", cfg.apiOrigin).href, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: cfg.key, question, history }),
    });
    if (res.status === 429) return { role: "assistant", content: RATE_LIMITED };
    if (res.status === 403) return { role: "assistant", content: NOT_CONFIGURED };
    if (!res.ok || !res.body) throw new Error(`request failed (${res.status})`);

    let answer = "";
    let citations: Citation[] = [];
    let errored = false;
    await readNdjson(res.body, (e) => {
      if (e.type === "token") {
        answer += e.text;
        setDraft(answer);
        scrollLog();
      } else if (e.type === "citations") {
        citations = e.citations;
      } else if (e.type === "error") {
        errored = true;
      }
    });
    if (errored || !answer.trim()) return { role: "assistant", content: FALLBACK };
    return { role: "assistant", content: answer.trim(), citations };
  }

  async function ask(e: Event) {
    e.preventDefault();
    const question = input.trim();
    if (!question || busy) return;
    const history: ChatMessage[] = turns.slice(-6).map((t) => ({ role: t.role, content: t.content }));
    setTurns((prev) => [...prev, { role: "user", content: question }]);
    setInput("");
    setBusy(true);
    setDraft("");
    scrollLog();

    let reply: Turn;
    try {
      reply = await queryOnce(history, question);
    } catch {
      try {
        reply = await queryOnce(history, question); // one retry on network failure
      } catch {
        reply = { role: "assistant", content: FALLBACK };
      }
    }
    setTurns((prev) => [...prev, reply]);
    setDraft("");
    setBusy(false);
    scrollLog();
  }

  if (!open) {
    return (
      <button type="button" class="launch" ref={launchRef} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        Ask about city services
      </button>
    );
  }

  return (
    <div class="panel" role="dialog" aria-label="City services assistant" onKeyDown={onKeyDown}>
      <div class="head">
        <h2>Ask about city services</h2>
        <button type="button" aria-label="Close" onClick={() => setOpen(false)}>
          ×
        </button>
      </div>
      <div class="log" ref={logRef} role="log">
        {turns.length === 0 && (
          <div class="msg bot">
            Hi! Ask me about city services, permits, ordinances, or local rules.
          </div>
        )}
        {turns.map((t) => (
          <div class={`msg ${t.role === "user" ? "user" : "bot"}`}>
            {t.content}
            {t.citations && t.citations.length > 0 && (
              <div class="cites">
                {t.citations.map((c) => (
                  <a href={new URL(c.url, cfg.apiOrigin).href} target="_blank" rel="noopener noreferrer">
                    {c.citation}
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && <div class="msg bot">{draft || "Looking that up…"}</div>}
      </div>
      <form class="form" onSubmit={ask}>
        <input
          value={input}
          ref={inputRef}
          onInput={(e) => setInput((e.target as HTMLInputElement).value)}
          placeholder="Type your question…"
          maxLength={1000}
          aria-label="Your question"
        />
        <button type="submit" disabled={busy || !input.trim()}>
          Ask
        </button>
      </form>
      <div class="foot">General legal information, not legal advice · Powered by Corpus</div>
    </div>
  );
}
