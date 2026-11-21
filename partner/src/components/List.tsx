"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const PAGE = 50;
/** Server-side paginated table. Never loads more than 50 rows, so it stays fast with thousands of records. */
export default function List({ table, columns, order }: { table: string; columns: { key: string; label: string }[]; order: string }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]); const [page, setPage] = useState(0); const [total, setTotal] = useState(0); const [err, setErr] = useState("");
  useEffect(() => {
    supabase.from(table).select(columns.map((c) => c.key).join(","), { count: "exact" }).order(order).range(page * PAGE, page * PAGE + PAGE - 1)
      .then(({ data, count, error }) => { if (error) setErr(error.message); else { setRows((data as unknown as Record<string, unknown>[]) ?? []); setTotal(count ?? 0); } });
  }, [table, page, order, columns]);
  return (<div className="card">{err && <div className="note">{err}</div>}
    <table><thead><tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{columns.map((c) => <td key={c.key}>{String(r[c.key] ?? "")}</td>)}</tr>)}</tbody></table>
    <p>{total} records · page {page + 1} of {Math.max(1, Math.ceil(total / PAGE))} <button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button> <button className="btn" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)}>Next</button></p></div>);
}
