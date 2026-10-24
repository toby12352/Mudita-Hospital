import { useI18n } from "@/shared/i18n";

type Props = {
  onClick: () => void;
  disabled?: boolean;
};

/** Red circular X — used on alert dialogs and modal headers. */
export function DialogCloseButton({ onClick, disabled }: Props) {
  const { t } = useI18n();

  return (
    <button
      type="button"
      className="alert-dialog-close"
      aria-label={t("close")}
      onClick={onClick}
      disabled={disabled}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path
          d="M4 4l8 8M12 4L4 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
