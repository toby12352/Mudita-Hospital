type Props = {
  label: string;
  tone?: "ok" | "warn" | "danger" | "default";
};

export function AlertChip({ label, tone = "default" }: Props) {
  const cls = tone === "default" ? "alert-chip" : `alert-chip ${tone}`;
  return <span className={cls}>{label}</span>;
}
