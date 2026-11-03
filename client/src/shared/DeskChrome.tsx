import type { HTMLAttributes, ReactNode } from "react";

export type DeskChromeTabItem = {
  id: string;
  label: string;
  /** Element id of the matching tabpanel. */
  controls: string;
};

/** Full-page desk shell: underline chrome above the white panel. */
export function DeskChrome({
  className,
  children,
  ...rest
}: {
  className?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, "className" | "children">) {
  return (
    <section
      className={className ? `desk-maintenance ${className}` : "desk-maintenance"}
      {...rest}
    >
      {children}
    </section>
  );
}

/** Switchable underline tabs (OPD/OT maintenance, Settings, Reports). */
export function DeskChromeTabs({
  ariaLabel,
  tabs,
  activeId,
  onSelect,
}: {
  ariaLabel: string;
  tabs: readonly DeskChromeTabItem[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="desk-maintenance-tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => {
        const selected = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            id={tab.id}
            role="tab"
            className={`desk-maintenance-tab${selected ? " active" : ""}`}
            aria-selected={selected}
            aria-controls={tab.controls}
            onClick={() => onSelect(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/** Tabpanel wrapper that stretches the nested desk. */
export function DeskChromePanel({
  id,
  labelledBy,
  children,
}: {
  id: string;
  labelledBy: string;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      role="tabpanel"
      aria-labelledby={labelledBy}
      className="desk-maintenance-panel"
    >
      {children}
    </div>
  );
}
