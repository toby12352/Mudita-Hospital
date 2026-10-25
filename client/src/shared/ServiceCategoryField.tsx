import type { ServiceCategory } from "@/features/settings/masterData";
import { useI18n } from "@/shared/i18n";

export function ServiceCategoryField({
  value,
  categories,
  onChange,
  disabled,
}: {
  value: string;
  categories: ServiceCategory[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <label className="field field-compact">
      <span>{t("category")}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        <option value="">{t("uncategorized")}</option>
        {categories.map((c) => (
          <option key={c.id} value={String(c.id)}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
