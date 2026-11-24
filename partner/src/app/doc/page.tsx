"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import TradeDoc from "@/components/TradeDoc";
import { supabase } from "@/lib/supabase";
import { Msg } from "@/components/ui";
import type { Doc } from "@/lib/tradeDoc";

/** /doc/?k=invoice&id=... or ?k=po&id=... : a printable document. Opens from Invoices and Orders. */
function Inner() {
  const [d, setD] = useState<Doc | null>(null); const [err, setErr] = useState("");
  useEffect(() => {
    const q = new URLSearchParams(window.location.search); const k = q.get("k") ?? "", id = q.get("id") ?? "";
    supabase.rpc("trade_doc", { k, doc_id: id }).then(({ data, error }) => { if (error) setErr(error.message); else setD(data as Doc); });
  }, []);
  return (<>{err && <Msg kind="bad">{err}</Msg>}{!d && !err && <div className="card">Loading document…</div>}
    {d && <><p className="no-print"><button className="btn pri" onClick={() => window.print()}>Print or save as PDF</button> <button className="btn" onClick={() => history.back()}>Back</button></p><TradeDoc d={d} /></>}</>);
}
export default function Page() { return <Shell page="doc">{() => <Inner />}</Shell>; }
