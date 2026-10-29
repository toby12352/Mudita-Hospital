import type { ReactNode } from "react";

export function FormSection({
  title,
  titleId,
  description,
  children,
  guide,
}: {
  title: string;
  titleId: string;
  description?: string;
  children: ReactNode;
  /** Inert tour anchor. Omitted when the lesson is not highlighting this section. */
  guide?: string;
}) {
  return (
    <section className="form-section" aria-labelledby={titleId} data-guide={guide}>
      <h3 id={titleId} className="form-section-title">
        {title}
      </h3>
      {description ? <p className="form-section-desc">{description}</p> : null}
      {children}
    </section>
  );
}
