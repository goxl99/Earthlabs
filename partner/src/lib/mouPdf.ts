// Turns the (editable) MOU text into a clean A4 PDF with the EarthLabs letterhead. Runs in the browser.
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const TEAL: [number, number, number] = [19, 89, 90];
const clean = (s: string) => s.replace(/₹\s?/g, "Rs. ").replace(/→/g, ">").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/ /g, " ").replace(/●/g, "____");
type Seg = { t: string; b: boolean };
const segs = (s: string): Seg[] => s.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((x) => (x.startsWith("**") && x.endsWith("**") ? { t: x.slice(2, -2), b: true } : { t: x, b: false }));

export async function loadLogo(base: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const blob = await (await fetch(`${base}logo.png`)).blob();
    const data: string = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(blob); });
    const img = new Image(); await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = data; });
    return { data, w: img.naturalWidth, h: img.naturalHeight };
  } catch { return null; }
}

export function mouToPdf(text: string, opts: { logo: { data: string; w: number; h: number } | null; footer: string }): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, H = 297, M = 18, TOP = 30, BOT = 22, CW = W - 2 * M;
  let y = TOP;
  const room = (need: number) => { if (y + need > H - BOT) { doc.addPage(); y = TOP; } };
  const rich = (s: string, x: number, width: number, size: number, opt: { bold?: boolean; gap?: number; align?: "center" } = {}) => {
    doc.setFontSize(size); const lh = size * 0.42;
    const words: { w: string; b: boolean }[] = [];
    for (const sg of segs(clean(s))) for (const w of sg.t.split(/(\s+)/).filter(Boolean)) words.push({ w, b: sg.b || !!opt.bold });
    let line: { w: string; b: boolean }[] = [], lw = 0; const lines: { w: string; b: boolean }[][] = [];
    for (const wd of words) { doc.setFont("helvetica", wd.b ? "bold" : "normal"); const ww = doc.getTextWidth(wd.w);
      if (lw + ww > width && line.length && wd.w.trim()) { lines.push(line); line = []; lw = 0; if (!wd.w.trim()) continue; }
      line.push(wd); lw += ww; }
    if (line.length) lines.push(line);
    for (const ln of lines) { room(lh + 1); let cx = opt.align === "center" ? x + (width - ln.reduce((a, c) => (doc.setFont("helvetica", c.b ? "bold" : "normal"), a + doc.getTextWidth(c.w)), 0)) / 2 : x;
      for (const c of ln) { doc.setFont("helvetica", c.b ? "bold" : "normal"); doc.text(c.w, cx, y); cx += doc.getTextWidth(c.w); } y += lh + 0.9; }
    y += opt.gap ?? 1.6;
  };
  const lines = text.split("\n"); let i = 0;
  while (i < lines.length) {
    const L = lines[i].trimEnd();
    if (!L.trim()) { i++; continue; }
    if (L.startsWith("|")) {
      const rows: string[][] = []; while (i < lines.length && lines[i].trim().startsWith("|")) { const r = lines[i].trim(); i++; if (/^\|\s*-{3}/.test(r)) continue; rows.push(r.slice(1, -1).split("|").map((c) => clean(c.trim()).replace(/\*\*/g, ""))); }
      const head = rows.shift() ?? [];
      room(20);
      autoTable(doc, { startY: y, head: [head], body: rows, theme: "grid", margin: { left: M, right: M, top: TOP, bottom: BOT }, styles: { fontSize: 9, cellPadding: 2, lineColor: [190, 200, 200], textColor: [30, 30, 30], font: "helvetica" },
        headStyles: { fillColor: TEAL, textColor: 255 }, didParseCell: (d) => { if (d.section === "body" && /^(Signature|Witness)/.test(String(d.row.raw && (d.row.raw as string[])[0]))) d.cell.styles.minCellHeight = 16; } });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4; continue;
    }
    i++;
    if (L.startsWith("# ")) { y += 2; rich(L.slice(2), M, CW, 16, { bold: true, align: "center", gap: 4 }); continue; }
    if (L.startsWith("## ")) { y += 3; doc.setTextColor(...TEAL); rich(L.slice(3), M, CW, 12.5, { bold: true, gap: 2 }); doc.setTextColor(30, 30, 30); continue; }
    if (L.startsWith("### ")) { y += 4; room(30); doc.setTextColor(...TEAL); rich(L.slice(4), M, CW, 12, { bold: true, gap: 2 }); doc.setTextColor(30, 30, 30); continue; }
    doc.setTextColor(30, 30, 30);
    if (/^- /.test(L)) { room(8); doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.text("-", M + 2, y); rich(L.slice(2), M + 7, CW - 7, 10); continue; }
    const n = L.match(/^(\d+)\. /); if (n) { room(8); doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.text(n[1] + ".", M + 2, y); rich(L.slice(n[0].length), M + 8, CW - 8, 10); continue; }
    rich(L, M, CW, 10);
  }
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    if (opts.logo) { const lh = 13, lw = (opts.logo.w / opts.logo.h) * lh; doc.addImage(opts.logo.data, "PNG", M, 8, lw, lh); }
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...TEAL); doc.text("EarthLabs Innovative Products Pvt. Ltd.", W - M, 13, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(110, 110, 110); doc.text("Herbal and eco-conscious hand wash and cleaning products", W - M, 17.5, { align: "right" });
    doc.setDrawColor(...TEAL); doc.setLineWidth(0.4); doc.line(M, 24, W - M, 24);
    doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.2); doc.line(M, H - 16, W - M, H - 16);
    doc.setFontSize(8); doc.text(clean(opts.footer), M, H - 11); doc.text(`Page ${p} of ${pages}`, W - M, H - 11, { align: "right" });
  }
  return doc.output("blob");
}
