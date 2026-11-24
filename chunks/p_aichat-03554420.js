import{a as sb,e as esc,o as toast}from"./chunk-RFCTVU6U.js";
import"./chunk-QHDNOTBI.js";

// ---------- tiny safe markdown (escape first, then format) ----------
const inline = s => esc(s)
  .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
  .replace(/(^|[^*\w])\*(?!\s)([^*]+?)\*(?![*\w])/g, "$1<i>$2</i>")
  .replace(/`([^`]+)`/g, "<code>$1</code>");
const cells = l => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim());
const isNum = s => /^[-+(]?\s*[₹$]?\s*[\d,]+(\.\d+)?\s*(%|L|ml|kg|g|pcs)?\)?$/i.test(s.replace(/\*\*/g, "").trim());
const isSep = l => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l) && l.includes("-");
export const md = src => {
  const L = String(src ?? "").replace(/\r/g, "").split("\n"), out = []; let i = 0, list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  while (i < L.length) {
    const ln = L[i];
    if (/^\s*\|.*\|\s*$/.test(ln) && i + 1 < L.length && isSep(L[i + 1])) {
      close();
      const head = cells(ln); i += 2; const body = [];
      while (i < L.length && /^\s*\|.*\|\s*$/.test(L[i])) { body.push(cells(L[i])); i++; }
      out.push(`<div class="tbl-wrap"><table class="tbl ai-t"><thead><tr>${head.map(h => `<th>${inline(h)}</th>`).join("")}</tr></thead><tbody>${body.map(r => `<tr>${head.map((h, k) => { const v = r[k] ?? ""; return `<td data-l="${esc(h.replace(/\*\*/g, ""))}"${isNum(v) ? ' class="num"' : ""}>${inline(v)}</td>`; }).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    let m;
    if ((m = ln.match(/^(#{1,4})\s+(.*)$/))) { close(); const n = Math.min(m[1].length + 1, 4); out.push(`<h${n}>${inline(m[2])}</h${n}>`); }
    else if ((m = ln.match(/^\s*[-*•]\s+(.*)$/))) { if (list !== "ul") { close(); out.push("<ul>"); list = "ul"; } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = ln.match(/^\s*\d+[.)]\s+(.*)$/))) { if (list !== "ol") { close(); out.push("<ol>"); list = "ol"; } out.push(`<li>${inline(m[1])}</li>`); }
    else if (/^\s*([-*_])\1{2,}\s*$/.test(ln)) { close(); out.push("<hr>"); }
    else if (!ln.trim()) { close(); }
    else { close(); out.push(`<p>${inline(ln)}</p>`); }
    i++;
  }
  close(); return out.join("");
};

// ---------- exports ----------
const csvEsc = v => { const s = String(v ?? "").replace(/\s+/g, " ").trim(); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export const tablesToCsv = root => [...root.querySelectorAll("table.ai-t")].map(t =>
  [...t.querySelectorAll("tr")].map(r => [...r.children].map(c => csvEsc(c.textContent)).join(",")).join("\n")).join("\n\n");
const download = (name, text, type) => {
  const a = document.createElement("a"), url = URL.createObjectURL(new Blob(["﻿" + text], { type }));
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
};
const stamp = () => new Date().toISOString().slice(0, 10);
const printHtml = html => {
  const w = window.open("", "_blank");
  if (!w) { toast("Your browser blocked the print window. Allow pop-ups and try again.", "err"); return; }
  w.document.write(`<!doctype html><meta charset="utf-8"><title>EarthLabs report ${stamp()}</title><style>body{font:13px/1.5 system-ui,Arial,sans-serif;color:#222;margin:24px}h1{font-size:20px;color:#13595a}h2,h3,h4{color:#13595a;margin:14px 0 6px}table{border-collapse:collapse;width:100%;margin:8px 0}th{background:#13595a;color:#fff;text-align:left}th,td{border:1px solid #ccc;padding:5px 8px;font-size:12px}td.num{text-align:right}.f{color:#777;font-size:11px;margin-top:18px}</style><h1>EarthLabs · AI report</h1><div class="f">${new Date().toLocaleString("en-IN")}</div>${html}<div class="f">Prepared by the AI assistant from live data in the EarthLabs app. Indicative; check important numbers before acting.</div>`);
  w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
};

// ---------- chat ----------
export const SUGGESTIONS = [
  ["📊 Monthly business report", "Build my monthly business report: sales, money received and pending, expenses, profit by order, stock and production. Include a table and what to do next."],
  ["💸 Which orders lose money?", "Show profit by customer order in a table. Which orders lose money or earn very little, and why?"],
  ["🧾 Who owes us money?", "Make a customer-wise outstanding report with invoice dates and how late each is. Who should I call first?"],
  ["🧴 What to buy / reorder", "Which raw materials and packaging are low or will run out for the planned production? Give a reorder list as a table."],
  ["🎯 Reach 30% margin", "Using my unit economics, what MRP or cost changes would give a 30% margin on the 5 ml sachet and on the 250 ml bottle? Show scenarios in a table."],
  ["✅ What should I do this week?", "Look at everything and tell me the top 5 things to do this week, ranked by money impact."],
];
let HIST = [], BUSY = false;
const load = () => { try { HIST = JSON.parse(sessionStorage.getItem("aic") || "[]"); } catch { HIST = []; } };
const save = () => { try { sessionStorage.setItem("aic", JSON.stringify(HIST.slice(-30))); } catch { /* ignore */ } };
const page = () => (location.hash.replace(/^#\/?/, "").split("/")[0] || "dashboard");

export function openAiChat(opts = {}) {
  const prompt = typeof opts === "string" ? opts : opts.prompt;
  let root = document.getElementById("aic-root");
  if (!root) {
    load();
    root = document.createElement("div"); root.id = "aic-root"; root.className = "aic-bg";
    root.innerHTML = `<aside class="aic" role="dialog" aria-label="AI assistant" aria-modal="true">
      <header class="aic-h"><div><b>✨ AI assistant</b><div class="small muted">Asks your live data. Reads only; it never changes anything.</div></div><span class="grow"></span><button class="btn ghost sm" id="aic-ex" title="Make wider for reports">Wider</button><button class="btn ghost sm" id="aic-new" title="Start a new chat">New chat</button><button class="x" id="aic-x" aria-label="Close">×</button></header>
      <div class="aic-body" id="aic-body" aria-live="polite"></div>
      <form class="aic-f" id="aic-f"><textarea id="aic-in" rows="1" placeholder="Ask anything, or ask for a report…" aria-label="Message"></textarea><button class="btn" id="aic-send" type="submit">Send</button></form>
    </aside>`;
    document.body.appendChild(root); document.body.classList.add("noscroll");
    const body = root.querySelector("#aic-body"), inp = root.querySelector("#aic-in");
    const close = () => { root.remove(); document.body.classList.remove("noscroll"); document.removeEventListener("keydown", onKey); };
    const onKey = e => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    root.addEventListener("click", e => { if (e.target === root) close(); });
    root.querySelector("#aic-x").onclick = close;
    root.querySelector("#aic-ex").onclick = e => { const big = root.querySelector(".aic").classList.toggle("big"); e.target.textContent = big ? "Narrower" : "Wider"; };
    root.querySelector("#aic-new").onclick = () => { if (BUSY) return; HIST = []; save(); paint(); inp.focus(); };

    const scroll = () => { body.scrollTop = body.scrollHeight; };
    const msgHtml = (m, i) => m.role === "user"
      ? `<div class="aic-m u"><div class="aic-b">${esc(m.content).replace(/\n/g, "<br>")}</div></div>`
      : `<div class="aic-m a" data-i="${i}"><div class="aic-b md">${m.err ? `<div class="notice err">${esc(m.content)}</div>` : md(m.content)}</div>${m.steps?.length ? `<div class="small muted aic-st">Looked at: ${esc([...new Set(m.steps.map(s => s.note))].join(", "))}</div>` : ""}${m.err ? "" : `<div class="aic-act"><button class="btn ghost sm" data-a="copy">Copy</button>${/<table/.test(md(m.content)) ? '<button class="btn ghost sm" data-a="csv">Download Excel</button>' : ""}<button class="btn ghost sm" data-a="print">Print / PDF</button></div>`}</div>`;
    function paint() {
      if (!HIST.length) {
        body.innerHTML = `<div class="aic-empty"><h3>What would you like to know?</h3><p class="muted">I can read your sales, costs, stock, production and unit economics and answer in plain English, or build a report you can download or print.</p><div class="aic-chips">${SUGGESTIONS.map(([l], k) => `<button class="chip" data-s="${k}">${esc(l)}</button>`).join("")}</div></div>`;
      } else body.innerHTML = HIST.map(msgHtml).join("") + (BUSY ? '<div class="aic-m a"><div class="aic-b aic-think"><i></i><i></i><i></i><span class="small muted">Reading your data…</span></div></div>' : "");
      scroll();
    }
    root.paint = paint;
    body.addEventListener("click", async e => {
      const chip = e.target.closest("[data-s]"); if (chip) { send(SUGGESTIONS[+chip.dataset.s][1]); return; }
      const b = e.target.closest("[data-a]"); if (!b) return;
      const wrap = b.closest(".aic-m"), m = HIST[+wrap.dataset.i], el = wrap.querySelector(".md");
      if (b.dataset.a === "copy") { try { await navigator.clipboard.writeText(m.content); toast("Copied"); } catch { toast("Could not copy. Select the text and copy it.", "err"); } }
      if (b.dataset.a === "csv") download(`earthlabs-report-${stamp()}.csv`, tablesToCsv(el), "text/csv;charset=utf-8");
      if (b.dataset.a === "print") printHtml(el.innerHTML);
    });
    async function send(text) {
      text = (text ?? inp.value).trim(); if (!text || BUSY) return;
      inp.value = ""; inp.style.height = "auto"; HIST.push({ role: "user", content: text }); BUSY = true; paint();
      root.querySelector("#aic-send").disabled = true;
      try {
        const { data, error } = await sb.functions.invoke("ai-chat", { body: { messages: HIST.filter(h => !h.err).map(h => ({ role: h.role, content: h.content })), page: page() } });
        if (error) throw error;
        if (!data || data.error) HIST.push({ role: "assistant", err: true, content: data?.error === "not_configured" ? "AI is not switched on yet. Add the ANTHROPIC_API_KEY secret in Supabase → Edge Functions → Secrets." : (data?.message || "No answer came back.") });
        else HIST.push({ role: "assistant", content: data.reply, steps: data.steps || [] });
      } catch (e) { HIST.push({ role: "assistant", err: true, content: "Could not reach the assistant: " + (e.message || String(e)) }); }
      finally { BUSY = false; save(); paint(); root.querySelector("#aic-send") && (root.querySelector("#aic-send").disabled = false); }
    }
    root.send = send;
    root.querySelector("#aic-f").onsubmit = e => { e.preventDefault(); send(); };
    inp.addEventListener("input", () => { inp.style.height = "auto"; inp.style.height = Math.min(inp.scrollHeight, 140) + "px"; });
    inp.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && window.innerWidth > 860) { e.preventDefault(); send(); } });
    paint();
  }
  if (prompt) root.send(prompt); else root.querySelector("#aic-in").focus();
}
