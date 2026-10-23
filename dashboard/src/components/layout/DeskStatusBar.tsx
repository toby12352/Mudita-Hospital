export function DeskStatusBar({
  username,
  t,
}: {
  username: string;
  t: (k: string) => string;
}) {
  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <footer className="desk-status-bar" role="contentinfo">
      <div className="desk-status-shortcuts" />
      <span className="desk-status-date">{dateLabel}</span>
      <span className="desk-status-user">
        {t("deskShiftDay")} ({username})
      </span>
    </footer>
  );
}
