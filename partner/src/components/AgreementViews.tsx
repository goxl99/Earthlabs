"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { when } from "@/components/ui";
import { docxToText } from "@/lib/mou";
import { MOU_TEMPLATE_TEXT } from "@/lib/mouTemplateText";

export type Tpl = { id: string; name: string; version: number; type_code: string | null; active: boolean; storage_path: string };
type Ex = { id: string; partner_id: string; status: string; sent_at: string | null; signed_at: string | null; signed_path: string | null; mou_pdf_path: string | null; mou_body: string | null };
type P = { id: string; name: string; district: string | null; state: string | null; type_code: string | null };

/** Short-lived link to a private file in the agreements bucket. */
async function link(path: string, download?: string): Promise<string | null> {
  const { data } = await supabase.storage.from("agreements").createSignedUrl(path, 300, download ? { download } : undefined);
  return data?.signedUrl ?? null;
}
async function openFile(path: string, say: (m: string, bad?: boolean) => void, download?: string) {
  const u = await link(path, download); if (!u) return say("Could not open the file. Check that it still exists.", true);
  window.open(u, "_blank", "noopener");
}

function Modal({ title, onClose, children, foot }: { title: string; onClose: () => void; children: React.ReactNode; foot?: React.ReactNode }) {
  return (<div className="mod-bg" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}><div className="modal wide" onClick={(e) => e.stopPropagation()}>
    <header><h3 style={{ margin: 0, flex: 1 }}>{title}</h3><button className="x" aria-label="Close" onClick={onClose}>×</button></header>
    <div className="body">{children}</div>
    <footer>{foot}<button className="btn" onClick={onClose}>Close</button></footer></div></div>);
}
const pre = { whiteSpace: "pre-wrap", fontSize: 12, fontFamily: "inherit", margin: 0 } as const;

/** A list of the agreements that already exist (signed or on file), apart from the ones still being prepared. */
export function ExistingAgreements({ refresh, say }: { refresh: number; say: (m: string, bad?: boolean) => void }) {
  const [rows, setRows] = useState<Ex[]>([]); const [pp, setPp] = useState<Record<string, P>>({}); const [q, setQ] = useState(""); const [view, setView] = useState<Ex | null>(null); const [ready, setReady] = useState(false);
  useEffect(() => {
    (async () => {
      const r = ((await supabase.from("agreements").select("id,partner_id,status,sent_at,signed_at,signed_path,mou_pdf_path,mou_body").eq("status", "Signed").order("signed_at", { ascending: false }).limit(500)).data as Ex[]) ?? [];
      setRows(r);
      const ids = [...new Set(r.map((x) => x.partner_id))];
      if (ids.length) { const { data } = await supabase.from("partners").select("id,name,district,state,type_code").in("id", ids); setPp(Object.fromEntries(((data as P[]) ?? []).map((p) => [p.id, p]))); }
      setReady(true);
    })();
  }, [refresh]);
  const needle = q.trim().toLowerCase();
  const shown = rows.filter((a) => !needle || `${a.partner_id} ${pp[a.partner_id]?.name ?? ""} ${pp[a.partner_id]?.district ?? ""}`.toLowerCase().includes(needle));
  return (<>
    <h2>Existing partner agreements</h2>
    <div className="card"><p className="mini" style={{ marginTop: 0 }}>Every Dealer Agreement that has been signed. Open one to read its wording or to see the signed copy. Agreements still being prepared are listed under “Agreements in progress” below.</p>
      <input placeholder="Search by Partner ID, name or district" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 360 }} />
      <div className="tw"><table className="t"><thead><tr><th>Partner</th><th>Name</th><th>Area</th><th>Signed</th><th></th></tr></thead><tbody>
        {shown.map((a) => { const p = pp[a.partner_id]; return (<tr key={a.id}><td>{a.partner_id}</td><td>{p?.name ?? ""}</td><td>{[p?.district, p?.state].filter(Boolean).join(", ")}</td><td>{when(a.signed_at)}</td>
          <td><button className="btn out" onClick={() => setView(a)}>View agreement</button>{a.signed_path && <>{" "}<button className="btn out" onClick={() => openFile(a.signed_path as string, say)}>Signed copy</button></>}</td></tr>); })}
        {ready && shown.length === 0 && <tr><td colSpan={5}>{rows.length === 0 ? "No signed agreements yet." : "No agreement matches the search."}</td></tr>}
      </tbody></table></div></div>
    {view && <Modal title={`Dealer Agreement · ${view.partner_id}${pp[view.partner_id]?.name ? ` · ${pp[view.partner_id].name}` : ""}`} onClose={() => setView(null)}
      foot={<>{view.signed_path && <button className="btn out" onClick={() => openFile(view.signed_path as string, say)}>Open signed copy</button>}{view.mou_pdf_path && <button className="btn out" onClick={() => openFile(view.mou_pdf_path as string, say)}>Open agreement PDF</button>}</>}>
      <p className="mini" style={{ marginTop: 0 }}>Signed {when(view.signed_at) || "—"}{view.sent_at ? ` · sent ${when(view.sent_at)}` : ""}</p>
      {view.mou_body ? <pre style={pre}>{view.mou_body}</pre> : <p>No typed wording is stored for this agreement{view.signed_path || view.mou_pdf_path ? ". Use the buttons below to open the signed file." : " and no file is attached."}</p>}
    </Modal>}
  </>);
}

/** Templates: the built-in standard wording plus every uploaded template, with view, download and retire. */
export function TemplateList({ tp, isSuper, reload, say }: { tp: Tpl[]; isSuper: boolean; reload: () => void; say: (m: string, bad?: boolean) => void }) {
  const [shown, setShown] = useState<{ title: string; text: string; note?: string } | null>(null); const [busy, setBusy] = useState("");
  async function viewStd() { setShown({ title: "Standard Dealer Agreement wording", text: MOU_TEMPLATE_TEXT, note: "The built-in wording. Words in {{double braces}} are filled from the fields on each agreement." }); }
  async function viewTpl(t: Tpl) {
    const ext = t.storage_path.toLowerCase().split(".").pop() ?? ""; setBusy(t.id);
    try {
      if (!["docx", "txt", "md"].includes(ext)) { await openFile(t.storage_path, say); return; }
      const { data, error } = await supabase.storage.from("agreements").download(t.storage_path); if (error || !data) return say(error?.message ?? "Could not load the template", true);
      const text = ext === "docx" ? docxToText(new Uint8Array(await data.arrayBuffer())) : await data.text();
      setShown({ title: `${t.name} v${t.version}`, text, note: "Words in {{double braces}} or the placeholders you mapped are filled from the partner's details. To change this wording, upload the corrected file as a new template below and retire this one." });
    } catch (e) { say((e as Error).message, true); } finally { setBusy(""); }
  }
  async function toggle(t: Tpl) { const { error } = await supabase.from("mou_templates").update({ active: !t.active }).eq("id", t.id); say(error ? error.message : t.active ? `"${t.name}" retired. It is kept, but new agreements will not use it.` : `"${t.name}" is active again.`, !!error); reload(); }
  const ext = (t: Tpl) => (t.storage_path.split(".").pop() ?? "").toUpperCase();
  return (<>
    <div className="tw"><table className="t"><thead><tr><th>Template</th><th>Applies to</th><th>File</th><th>Status</th><th></th></tr></thead><tbody>
      <tr><td><b>Standard Dealer Agreement</b> <span className="mini">(built in)</span></td><td>All types</td><td>Text</td><td>Active</td><td><button className="btn out" onClick={viewStd}>View</button></td></tr>
      {tp.map((t) => <tr key={t.id}><td>{t.name} v{t.version}</td><td>{t.type_code ?? "All types"}</td><td>{ext(t)}</td><td>{t.active ? "Active" : "Retired"}</td>
        <td><button className="btn out" disabled={busy === t.id} onClick={() => viewTpl(t)}>{busy === t.id ? "Opening…" : "View"}</button>{" "}<button className="btn out" onClick={() => openFile(t.storage_path, say, `${t.name.replace(/[^\w.-]+/g, "-")}.${ext(t).toLowerCase()}`)}>Download</button>{isSuper && <>{" "}<button className="btn out" onClick={() => toggle(t)}>{t.active ? "Retire" : "Make active"}</button></>}</td></tr>)}
      {tp.length === 0 && <tr><td colSpan={5} className="mini">No uploaded templates yet. The standard wording above is used until you add one.</td></tr>}
    </tbody></table></div>
    {shown && <Modal title={shown.title} onClose={() => setShown(null)}>{shown.note && <p className="mini" style={{ marginTop: 0 }}>{shown.note}</p>}<pre style={pre}>{shown.text}</pre></Modal>}
  </>);
}
