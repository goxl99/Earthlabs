"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { Msg } from "@/components/ui";
import type { Brand } from "@/lib/tradeDoc";

const MAX = 300 * 1024;
/** Logo and billing details. Every document the system makes for this issuer uses them; the layout never changes. */
function Inner({ role, partnerId }: { role: string; partnerId?: string | null }) {
  const [oid, setOid] = useState(""); const [b, setB] = useState<Brand>({ bank: {} }); const [msg, setMsg] = useState(""); const [bad, setBad] = useState(false);
  useEffect(() => {
    (async () => {
      let id = role === "super_admin" ? "COMPANY" : partnerId ?? "";
      if (role === "vendor") { const { data } = await supabase.from("profiles").select("vendor_id").eq("id", (await supabase.auth.getUser()).data.user?.id ?? "").single(); id = (data as { vendor_id?: string } | null)?.vendor_id ?? ""; }
      setOid(id); if (!id) return;
      const { data, error } = await supabase.rpc("get_branding", { oid: id }); if (error) { setBad(true); setMsg(error.message); } else setB({ bank: {}, ...(data as Brand) });
    })();
  }, [role, partnerId]);
  const f = (k: keyof Brand) => ({ value: (b[k] as string) ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement>) => setB({ ...b, [k]: e.target.value }) });
  const bk = (k: "account_name" | "bank" | "account_no" | "ifsc") => ({ value: b.bank?.[k] ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement>) => setB({ ...b, bank: { ...b.bank, [k]: e.target.value } }) });
  const pick = (file?: File) => {
    if (!file) return; if (!/^image\/(png|jpeg|svg\+xml|webp)$/.test(file.type)) { setBad(true); setMsg("Use a PNG, JPG, SVG or WebP logo."); return; }
    if (file.size > MAX) { setBad(true); setMsg("Logo must be under 300 KB."); return; }
    const r = new FileReader(); r.onload = () => { setB({ ...b, logo: String(r.result) }); setMsg(""); }; r.readAsDataURL(file);
  };
  const save = async () => {
    const { error } = await supabase.rpc("set_branding", { oid, b }); setBad(!!error); setMsg(error ? error.message : "Saved. New documents use this logo and these details.");
  };
  if (!oid) return <div className="card">Your account is not linked to a partner or vendor yet.</div>;
  return (<><h1>Logo &amp; bank details</h1><p className="mini">Documents are made in this layout, with your logo and details. Only these fields change.</p>
    {msg && <Msg kind={bad ? "bad" : "ok"}>{msg}</Msg>}
    <div className="card"><div className="grid">
      <div><label>Logo (PNG, JPG, SVG or WebP, under 300 KB)</label><input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={(e) => pick(e.target.files?.[0])} />{b.logo && <p><img className="brand-logo" src={b.logo} alt="Logo preview" /></p>}</div>
      <div><label>Legal name</label><input {...f("legal_name")} /><label>Address</label><input {...f("address")} /><label>State</label><input {...f("state")} /><label>State code</label><input {...f("state_code")} placeholder="24" /></div>
      <div><label>GSTIN</label><input {...f("gstin")} /><label>PAN</label><input {...f("pan")} /><label>Email</label><input {...f("email")} /></div>
      <div><label>Bank account name</label><input {...bk("account_name")} /><label>Bank</label><input {...bk("bank")} /><label>Account number</label><input {...bk("account_no")} /><label>IFSC</label><input {...bk("ifsc")} /></div>
    </div><p><button className="btn pri" onClick={save}>Save</button></p></div></>);
}
export default function Page() { return <Shell page="branding">{(p) => <Inner role={p.role} partnerId={p.partner_id} />}</Shell>; }
