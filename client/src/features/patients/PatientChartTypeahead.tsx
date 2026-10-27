import type { Ref } from "react";
import { listPatients, type PatientChart } from "@/features/patients/api";
import { Typeahead } from "@/shared/Typeahead";
import { useI18n } from "@/shared/i18n";

type Props = {
  value: string;
  disabled?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  onChange: (value: string) => void;
  onPick: (patient: PatientChart) => void;
};

/** Name field that can pick an existing chart. Typing without a pick leaves the desk save path. */
export function PatientChartTypeahead({ value, disabled = false, inputRef, onChange, onPick }: Props) {
  const { t } = useI18n();
  return (
    <Typeahead
      value={value}
      disabled={disabled}
      autoFocus={!disabled}
      required={!disabled}
      inputRef={inputRef}
      dataFocus="bill-patient"
      ariaLabel={t("patientName")}
      placeholder={t("patientSearchPlaceholder")}
      onChange={onChange}
      loadSuggestions={async (term) => listPatients(term.trim())}
      getKey={(p) => p.id}
      renderOption={(p) => (
        <>
          <span className="typeahead-title">
            {p.name} · {t("chartLabel")} {p.id}
          </span>
          <span className="typeahead-sub">{p.phone}</span>
        </>
      )}
      onPick={onPick}
    />
  );
}
