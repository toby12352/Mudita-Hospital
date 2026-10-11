export function LanguageSwitcher({
  locale,
  onChange,
  t,
  compact,
}: {
  locale: "en" | "my";
  onChange: (l: "en" | "my") => void;
  t: (k: string) => string;
  compact?: boolean;
}) {
  return (
    <div className={`lang-switch ${compact ? "lang-compact" : ""}`} role="group" aria-label={t("language")}>
      <button
        type="button"
        className={`btn ghost ${locale === "en" ? "lang-active" : ""}`}
        onClick={() => onChange("en")}
      >
        {t("english")}
      </button>
      <button
        type="button"
        className={`btn ghost ${locale === "my" ? "lang-active" : ""}`}
        onClick={() => onChange("my")}
      >
        {t("myanmar")}
      </button>
    </div>
  );
}
