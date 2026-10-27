export function formatMMK(n: number): string {
  return n.toLocaleString("en-US");
}

/** Signed amount without a currency symbol: 0, +1,000, -1,000. */
export function formatDelta(n: number): string {
  if (n === 0) return "0";
  const sign = n > 0 ? "+" : "";
  return `${sign}${formatMMK(n)}`;
}
