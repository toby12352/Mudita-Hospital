import { clinicModules, type ClinicModule } from "@/app/portal";
import { getLocale, type Locale } from "@/shared/i18n";

function joinNames(names: string[], locale: Locale): string {
  if (names.length <= 1) return names[0] ?? "";
  const last = names[names.length - 1];
  const head = names.slice(0, -1);
  if (locale === "my") {
    if (head.length === 1) return `${head[0]} သို့မဟုတ် ${last}`;
    return `${head.join("၊ ")} သို့မဟုတ် ${last}`;
  }
  if (head.length === 1) return `${head[0]} or ${last}`;
  return `${head.join(", ")}, or ${last}`;
}

function welcomeLede(
  t: (k: string) => string,
  modules: readonly ClinicModule[],
  showSettings: boolean,
): string {
  const fullCatalog =
    showSettings &&
    modules.length === clinicModules.length &&
    clinicModules.every((module, index) => modules[index] === module);
  if (fullCatalog) return t("homeWelcomeLede");
  const names = [
    ...modules.map((module) => t(module)),
    ...(showSettings ? [t("settings")] : []),
    t("navAbout"),
  ];
  return t("homeWelcomeOpen").replace("{modules}", joinNames(names, getLocale()));
}

export function HomePage({
  displayName,
  modules,
  showSettings,
  t,
}: {
  displayName: string;
  modules: readonly ClinicModule[];
  showSettings: boolean;
  t: (k: string) => string;
}) {
  return (
    <section className="desk-welcome" aria-label={t("navHome")}>
      <h2 className="desk-welcome-title">{t("homeWelcomeTitle")}</h2>
      <p className="lede">
        {t("homeWelcomeHello").replace("{name}", displayName)}
      </p>
      <p className="lede">{welcomeLede(t, modules, showSettings)}</p>
    </section>
  );
}
