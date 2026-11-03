const AUTHOR = "Tun Aung Thaung";
const AUTHOR_INITIALS = "TAT";

const DESKS = [
  { nameKey: "opd", bodyKey: "aboutOpdBody" },
  { nameKey: "ot", bodyKey: "aboutOtBody" },
  { nameKey: "pharmacy", bodyKey: "aboutPharmacyBody" },
  { nameKey: "patients", bodyKey: "aboutPatientsBody" },
  { nameKey: "ipd", bodyKey: "aboutIpdBody" },
  { nameKey: "settings", bodyKey: "aboutSettingsBody" },
] as const;

export function AboutPage({ t }: { t: (k: string) => string }) {
  const year = new Date().getFullYear();

  return (
    <section className="desk-about" aria-label={t("navAbout")}>
      <p className="desk-about-kicker">{t("navAbout")}</p>
      <h2 className="desk-about-title">{t("aboutTitle")}</h2>
      <p className="desk-about-intro">{t("aboutIntro")}</p>

      <h3 className="desk-about-section">{t("aboutDesks")}</h3>
      <ul className="desk-about-cards">
        {DESKS.map((desk) => (
          <li key={desk.nameKey} className="desk-about-card">
            <p className="desk-about-card-name">{t(desk.nameKey)}</p>
            <p className="desk-about-card-body">{t(desk.bodyKey)}</p>
          </li>
        ))}
      </ul>

      <div className="desk-about-credit">
        <span className="desk-about-initials" aria-hidden="true">
          {AUTHOR_INITIALS}
        </span>
        <div className="desk-about-credit-text">
          <p className="desk-about-author">{t("aboutCredit").replace("{name}", AUTHOR)}</p>
          <p className="desk-about-copyright">
            {t("aboutCopyright").replace("{year}", String(year)).replace("{name}", AUTHOR)}
          </p>
        </div>
      </div>
    </section>
  );
}
