import type { User } from "../../auth";
import type { Locale } from "../../i18n";
import { AccountMenu } from "./AccountMenu";
import type { ConnState } from "./ServerBadge";

type Props = {
  title: string;
  user: User;
  locale: Locale;
  onLocale: (l: Locale) => void;
  onLogout: () => void;
  conn: ConnState;
  detail: string;
  onChangeServer: () => void;
  onRetry: () => void;
  t: (k: string) => string;
};

export function WorkspaceHeader({ title, t, ...account }: Props) {
  return (
    <header className="dash-workspace-header">
      <h1 className="dash-workspace-title">{title}</h1>
      <AccountMenu {...account} t={t} />
    </header>
  );
}
