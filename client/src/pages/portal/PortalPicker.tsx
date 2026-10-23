import type { PortalId } from "@/app/types";

const portals: { id: PortalId; titleKey: string; subKey: string }[] = [
  { id: "opd", titleKey: "opd", subKey: "tileOpdSub" },
  { id: "ot", titleKey: "ot", subKey: "tileOtSub" },
  { id: "pharmacy", titleKey: "pharmacy", subKey: "tilePharmacySub" },
  { id: "settings", titleKey: "settings", subKey: "tileSettingsSub" },
];

export function PortalPicker({
  onPick,
  t,
}: {
  onPick: (portal: PortalId) => void;
  t: (k: string) => string;
}) {
  return (
    <section className="portal-picker" aria-label={t("portalPickerTitle")}>
      <h2>{t("portalPickerTitle")}</h2>
      <p className="lede">{t("portalPickerLede")}</p>
      <div className="tiles">
        {portals.map((portal) => (
          <button
            key={portal.id}
            type="button"
            className="tile"
            onClick={() => onPick(portal.id)}
          >
            <span className="tile-title">{t(portal.titleKey)}</span>
            <span className="tile-sub">{t(portal.subKey)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
