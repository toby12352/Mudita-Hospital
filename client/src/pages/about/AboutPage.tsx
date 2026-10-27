const AUTHOR = "Tun Aung Thaung";

export function AboutPage({ t }: { t: (k: string) => string }) {
  const year = new Date().getFullYear();

  return (
    <section className="desk-about" aria-label={t("navAbout")}>
      <h2 className="desk-about-title">{t("aboutTitle")}</h2>
      <p className="lede">{t("aboutIntro")}</p>
      <ul className="desk-about-list">
        <li>{t("aboutOpd")}</li>
        <li>{t("aboutOt")}</li>
        <li>{t("aboutPharmacy")}</li>
        <li>{t("aboutPatients")}</li>
        <li>{t("aboutIpd")}</li>
        <li>{t("aboutSettings")}</li>
      </ul>
      <div className="desk-about-credit">
        <p className="desk-about-author">{t("aboutCredit").replace("{name}", AUTHOR)}</p>
        <p className="desk-about-copyright">
          {t("aboutCopyright").replace("{year}", String(year)).replace("{name}", AUTHOR)}
        </p>
      </div>
    </section>
  );
}
