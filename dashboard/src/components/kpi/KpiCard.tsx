type Props = {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "accent" | "warn" | "danger";
};

export function KpiCard({ label, value, sub, tone = "default" }: Props) {
  const cls = tone === "default" ? "kpi-card" : `kpi-card ${tone}`;
  return (
    <article className={cls}>
      <p className="kpi-label">{label}</p>
      <p className="kpi-value">{value}</p>
      {sub ? <p className="kpi-sub">{sub}</p> : null}
    </article>
  );
}
