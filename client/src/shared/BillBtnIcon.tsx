import { ActionIcon, type ActionIconName } from "@/shared/ActionIcon";

/** Fixed 16×16 slot so spinner / check swaps do not shift rail layout. */
export function BillBtnIcon(props: {
  name: ActionIconName;
  pending?: boolean;
  /** Drawn success check (replaces idle icon while true). */
  success?: boolean;
}) {
  const { name, pending = false, success = false } = props;
  return (
    <span
      className={`opd-bill-rail-btn-icon-slot${success && !pending ? " opd-bill-rail-btn-icon-slot--success" : ""}`}
      aria-hidden="true"
    >
      {pending ? (
        <span className="opd-bill-btn-spinner" />
      ) : success ? (
        <svg className="opd-bill-btn-check" viewBox="0 0 16 16" width="16" height="16">
          <path
            className="opd-bill-btn-check-path"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.25 8.25l3.1 3.1 6.4-6.6"
          />
        </svg>
      ) : (
        <ActionIcon name={name} />
      )}
    </span>
  );
}
