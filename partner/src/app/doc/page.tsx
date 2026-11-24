"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import TradeDoc from "@/components/TradeDoc";
import { supabase } from "@/lib/supabase";
import { Msg } from "@/components/ui";
import type { Doc } from "@/lib/tradeDoc";

/** /doc/?k=invoice|po|challan|proforma&id=... : a printable document. Opens from Invoices and Orders. */
function Inner() {
  const [d, setD] = useState<Doc | null>(null); const [err, setErr] = useState("");
  useEffect(() => {
    const q = new URLSearchParams(window.location.search); const k = q.get("k") ?? "", id = q.get("id") ?? "";
    const load = () => supabase.rpc("trade_doc", { k, doc_id: id }).then(({ data, error }) => { if (error) setErr(error.message); else setD(data as Doc); return data as Doc | null; });
    // A challan pulls its batch and QA/QC status from the Batch system. Staff refresh the copy first; partners read the stored copy.
    load().then(async (doc) => {
      if (!doc || k !== "challan" || !doc.doc.batch_ref) return;
      const { data: role } = await supabase.rpc("my_role");
      if (!role || ["dealer", "distributor", "vendor"].includes(String(role))) return;
      const { error } = await supabase.functions.invoke("batch-qc", { body: { sync: true } });
      if (!error) await load();
    });
  }, []);
  return (<>{err && <Msg kind="bad">{err}</Msg>}{!d && !err && <div className="card">Loading document…</div>}
    {d && <><p className="no-print"><button className="btn pri" onClick={() => window.print()}>Print or save as PDF</button> <button className="btn" onClick={() => history.back()}>Back</button></p><TradeDoc d={d} /></>}</>);
}
export default function Page() { return <Shell page="doc">{() => <Inner />}</Shell>; }
