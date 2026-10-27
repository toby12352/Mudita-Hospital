import { useEffect, useState } from "react";
import { getPatient } from "@/features/patients/api";

/** Open stay for a linked chart. Null when the patient has none, or no chart is linked. */
export function useOpenAdmission(patientId: number | null): number | null {
  const [admissionId, setAdmissionId] = useState<number | null>(null);
  useEffect(() => {
    if (patientId == null) {
      setAdmissionId(null);
      return;
    }
    let cancelled = false;
    getPatient(patientId)
      .then((patient) => {
        if (!cancelled) setAdmissionId(patient.open_admission_id ?? null);
      })
      .catch(() => {
        if (!cancelled) setAdmissionId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [patientId]);
  return admissionId;
}
