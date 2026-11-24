/** Text that is safe inside a PostgREST .or() filter: commas, percent signs, parentheses and quotes are removed. */
export const cleanTerm = (q: string) => q.trim().replace(/[%,()"'\\*]/g, "");
export type PartnerFilter = { q: string; type: string; status: string; district: string };
export const emptyFilter: PartnerFilter = { q: "", type: "", status: "", district: "" };
export const activeFilters = (f: PartnerFilter) => Object.values(f).filter((v) => v.trim()).length;
