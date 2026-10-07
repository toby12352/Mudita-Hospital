import { getApiBase } from "../../api";

export type ConnState = "checking" | "ok" | "offline";

type Props = {
  conn: ConnState;
  detail: string;
  onChangeServer?: () => void;
  onRetry?: () => void;
  t: (k: string) => string;
  compact?: boolean;
};

export function ServerBadge({
  conn,
  detail,
  onChangeServer,
  onRetry,
  t,
  compact,
}: Props) {
  const label =
    conn === "ok" ? t("serverConnected") : conn === "checking" ? t("checking") : t("serverOffline");
  return (
    <section
      className={`status-panel status-${conn}${compact ? " status-compact" : ""}`}
      aria-live="polite"
      title={detail}
    >
      <div className="status-dot" aria-hidden="true" />
      <div className="status-body">
        <p className="status-label">{label}</p>
        <p className="status-detail">{detail}</p>
        <p className="status-meta">
          Endpoint: <code>{getApiBase()}</code>
        </p>
        {!compact && (conn === "offline" || onChangeServer) ? (
          <div className="btn-row status-actions">
            {conn === "offline" && onRetry ? (
              <button type="button" className="btn ghost" onClick={onRetry}>
                {t("retry")}
              </button>
            ) : null}
            {onChangeServer ? (
              <button type="button" className="btn ghost" onClick={onChangeServer}>
                {t("changeServerIp")}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
