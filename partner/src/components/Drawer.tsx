"use client";
import { useEffect, useRef, type ReactNode } from "react";

/** Right-hand review drawer in the walkthrough's style. Closes on Escape or a click outside; focus moves into it. */
export default function Drawer({ title, sub, foot, onClose, children }: { title: ReactNode; sub?: ReactNode; foot?: ReactNode; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector(".mod-bg")) onClose(); };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); prev?.focus?.(); };
  }, [onClose]);
  return (<>
    <div className="drawer-bg" onClick={onClose} />
    <aside className="drawer" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : "Details"} tabIndex={-1} ref={ref}>
      <header><div style={{ flex: 1 }}><h2 style={{ margin: 0 }}>{title}</h2>{sub && <div className="mini">{sub}</div>}</div><button className="btn sm" aria-label="Close" onClick={onClose}>×</button></header>
      <div className="body">{children}</div>
      {foot && <footer>{foot}</footer>}
    </aside></>);
}
