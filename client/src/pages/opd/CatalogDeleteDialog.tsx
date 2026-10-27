import { AlertDialog } from "@/shared/AlertDialog";
import { useI18n } from "@/shared/i18n";

type Props = {
  identity: string;
  message: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

/** AlertDialog confirm chrome; pages own step / API state. */
export function CatalogDeleteDialog({
  identity,
  message,
  busy,
  error,
  onCancel,
  onConfirm,
}: Props) {
  const { t } = useI18n();

  return (
    <AlertDialog
      tone="warning"
      title={t("delete")}
      identity={identity}
      message={message}
      error={error}
      busy={busy}
      danger
      confirmLabel={t("delete")}
      onClose={onCancel}
      onConfirm={onConfirm}
    />
  );
}
