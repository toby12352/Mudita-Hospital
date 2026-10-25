import type { ReactNode } from "react";
import brandLogo from "@/assets/logo.png";
import { useI18n } from "@/shared/i18n";

export function AuthFrame({
  title,
  lede,
  children,
}: {
  title?: string;
  lede?: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <main className="shell shell-auth">
      <section className="auth-card">
        {title != null ? (
          <header className="brand">
            <div className="brand-lockup">
              <img src={brandLogo} alt="" className="brand-logo brand-logo--lg" />
              <div>
                <p className="eyebrow">{t("brand")}</p>
                <h1>{title}</h1>
                {lede != null ? <p className="lede">{lede}</p> : null}
              </div>
            </div>
          </header>
        ) : null}
        {children}
      </section>
    </main>
  );
}
