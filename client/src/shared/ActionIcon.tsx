export type ActionIconName =
  | "plus"
  | "search"
  | "filter"
  | "history"
  | "edit"
  | "trash"
  | "undo"
  | "check"
  | "print"
  | "transfer"
  | "box"
  | "clipboard"
  | "sliders"
  | "chevron";

/** 16px stroke icon for clinic action buttons. Color follows the button. */
export function ActionIcon({ name }: { name: ActionIconName }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      {paths(name)}
    </svg>
  );
}

function paths(name: ActionIconName) {
  const stroke = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "plus":
      return <path {...stroke} d="M8 3.25v9.5M3.25 8h9.5" />;
    case "search":
      return (
        <>
          <circle {...stroke} cx="7" cy="7" r="3.25" />
          <path {...stroke} d="M9.5 9.5L12.75 12.75" />
        </>
      );
    case "filter":
      return <path {...stroke} d="M2.75 3.5h10.5L9.25 8.1V12l-2.5 1.15V8.1L2.75 3.5z" />;
    case "history":
      return (
        <>
          <circle {...stroke} cx="8" cy="8" r="5" />
          <path {...stroke} d="M8 5.25V8l2.15 1.4" />
        </>
      );
    case "edit":
      return (
        <path
          {...stroke}
          d="M9.9 2.9l3.2 3.2L6.2 13H3v-3.2L9.9 2.9z"
        />
      );
    case "trash":
      return (
        <>
          <path {...stroke} d="M3.25 4.5h9.5" />
          <path {...stroke} d="M6.25 4.5V3.25h3.5V4.5" />
          <path {...stroke} d="M4.4 4.5l.55 8.25h6.1l.55-8.25" />
          <path {...stroke} d="M6.75 7v3.75M9.25 7v3.75" />
        </>
      );
    case "undo":
      return (
        <>
          <path {...stroke} d="M6.4 3.6L3.3 6.2 6.4 8.8" />
          <path {...stroke} d="M4.1 6.2h4.1a4 4 0 1 1 0 5.3" />
        </>
      );
    case "check":
      return <path {...stroke} d="M3.25 8.25l3.1 3.1 6.4-6.6" />;
    case "print":
      return (
        <>
          <path {...stroke} d="M4.25 5.5V2.75h7.5V5.5" />
          <path {...stroke} d="M4.25 11.5H3.25A1.5 1.5 0 0 1 1.75 10V7A1.5 1.5 0 0 1 3.25 5.5h9.5A1.5 1.5 0 0 1 14.25 7v3A1.5 1.5 0 0 1 12.75 11.5H11.75" />
          <path {...stroke} d="M4.25 9.75h7.5v3.5h-7.5z" />
        </>
      );
    case "transfer":
      return (
        <>
          <path {...stroke} d="M2.75 5.5h8.5" />
          <path {...stroke} d="M8.75 2.75L11.75 5.5 8.75 8.25" />
          <path {...stroke} d="M13.25 10.5H4.75" />
          <path {...stroke} d="M7.25 7.75L4.25 10.5 7.25 13.25" />
        </>
      );
    case "box":
      return (
        <>
          <path {...stroke} d="M2.75 5.25L8 2.75l5.25 2.5v5.5L8 13.25 2.75 10.75z" />
          <path {...stroke} d="M2.75 5.25L8 7.75l5.25-2.5M8 7.75V13.25" />
        </>
      );
    case "clipboard":
      return (
        <>
          <path {...stroke} d="M5.5 3.25h5v1.5h-5z" />
          <path {...stroke} d="M4.25 4.75h7.5v8.5h-7.5z" />
          <path {...stroke} d="M6 8h4M6 10.25h4" />
        </>
      );
    case "sliders":
      return (
        <>
          <path {...stroke} d="M2.25 4h4M9.75 4h4" />
          <path {...stroke} d="M8 2.25v3.5" />
          <path {...stroke} d="M2.25 8h6.5M12.25 8h1.5" />
          <path {...stroke} d="M10.5 6.25v3.5" />
          <path {...stroke} d="M2.25 12h1.5M7.25 12h6.5" />
          <path {...stroke} d="M5.5 10.25v3.5" />
        </>
      );
    case "chevron":
      return <path {...stroke} d="M4 6.25 8 10.25 12 6.25" />;
  }
}
