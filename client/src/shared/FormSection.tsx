import type { ReactNode } from "react";

export function FormSection({
  title,
  titleId,
  description,
  children,
}: {
  title: string;
  titleId: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="form-section" aria-labelledby={titleId}>
      <h3 id={titleId} className="form-section-title">
        {title}
      </h3>
      {description ? <p className="form-section-desc">{description}</p> : null}
      {children}
    </section>
  );
}
