export function HomePage({ t }: { t: (k: string) => string }) {
  return (
    <section className="home-howto" aria-label={t("homeHowtoTitle")}>
      <div className="home-howto-section">
        <h2>{t("homeHowtoTitle")}</h2>
        <p className="lede">{t("homeHowtoLede")}</p>
      </div>

      <div className="home-howto-section">
        <h3>{t("homeHowtoBasics")}</h3>
        <ol>
          <li>{t("homeHowtoStep1")}</li>
          <li>{t("homeHowtoStep2")}</li>
          <li>{t("homeHowtoStep3")}</li>
          <li>{t("homeHowtoStep4")}</li>
        </ol>
      </div>

      <div className="home-howto-section">
        <h3>OPD</h3>
        <ol>
          <li>{t("homeHowtoOpd1")}</li>
          <li>{t("homeHowtoOpd2")}</li>
          <li>{t("homeHowtoOpd3")}</li>
        </ol>
      </div>

      <div className="home-howto-section">
        <h3>OT</h3>
        <ol>
          <li>{t("homeHowtoOt1")}</li>
          <li>{t("homeHowtoOt2")}</li>
          <li>{t("homeHowtoOt3")}</li>
        </ol>
      </div>

      <div className="home-howto-section">
        <h3>{t("pharmacy")}</h3>
        <ol>
          <li>{t("homeHowtoPharm1")}</li>
          <li>{t("homeHowtoPharm2")}</li>
        </ol>
      </div>

      <div className="home-howto-section">
        <h3>{t("homeHowtoVideos")}</h3>
        <div className="video-placeholder" role="img" aria-label={t("homeHowtoVideosSoon")}>
          {t("homeHowtoVideosSoon")}
        </div>
      </div>
    </section>
  );
}
