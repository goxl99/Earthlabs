type Row = Record<string, unknown> | null;
/** Fields that changed between the old and new copy of a row (audit rows hold full copies). */
export function changedFields(o: Row, n: Row): string[] {
  const keys = new Set([...Object.keys(o ?? {}), ...Object.keys(n ?? {})]);
  return [...keys].filter((k) => JSON.stringify(o?.[k]) !== JSON.stringify(n?.[k]));
}

