/** The Procurement AI assistant: quick questions answered by the database from live stock, orders, ledger and scores (ai_assist). Read-only. */
export const QUESTIONS: { key: string; label: string }[] = [
  { key: "reorder", label: "What should we reorder this week?" },
  { key: "delay", label: "Which vendors are a delay risk?" },
  { key: "credit", label: "Who has earned credit?" },
  { key: "scheme", label: "Which scheme should we show?" },
  { key: "paycarry", label: "How does pay and carry work?" },
];
export type Answer = { topic: string; title: string; summary: string; note: string; rows: Record<string, string | number | null>[] };
/** Column heading from a key: "avg_days_taken" -> "Avg days taken". */
export const heading = (k: string) => { const s = k.replace(/_/g, " "); return s.charAt(0).toUpperCase() + s.slice(1); };
/** Cell text: numbers kept as they are, empty shown as a dash. */
export const cell = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? "–" : String(v));
/** Only the reorder answer can lead to an action, and only for people who may raise release orders. */
export const canRaise = (topic: string, role: string) => topic === "reorder" && (role === "super_admin" || role === "warehouse");
/** Insight cards for AI Intelligence (ai_insights). */
export type Insights = {
  top: { id: string; name: string; value90: number; orders90: number } | null;
  at_risk: { id: string; name: string; last30: number; prev30: number }[];
  inactive: { id: string; name: string; last_order: string | null }[];
  forecast: { outstanding: number; partners_owing: number; orders_in_hand: number };
};
