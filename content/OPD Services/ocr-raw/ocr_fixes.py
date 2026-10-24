"""Exact OCR-raw → corrected particular map (compact key)."""
from __future__ import annotations

import re

# compact(ocr) -> correct display name
FIXES: dict[str, str] = {
    "alcrqyscroennqpaneli": "Allergy Screening Panel I",
    "allerqyscroennqpanelil": "Allergy Screening Panel II",
    "alerqyscroennqpanelill": "Allergy Screening Panel III",
    "denque1qgIqx": "Dengue (IgG/IgM)",
    "denque1qglqx": "Dengue (IgG/IgM)",
    "denquecombo": "Dengue combo",
    "g6pdsooeninqquantl": "G6PD screening (Quanti)",
    "hbeabqusntitve": "HBe Ab (Quantitative)",
    "hbaaaqusntitative": "HBs Ag (Quantitative)",
    "hbeaaqulltatve": "HBe Ag (Qualitative)",
    "hbsaascroeninqecl": "HBs Ag (Screening-ECL)",
    "hiqhsensitnecrphscrp": "High sensitive CRP (Hs CRP)",
    "immunaqlobinalaqquantl": "Immunoglobulin A (Ig A/Quanti)",
    "immunaqlobingiagquantl": "Immunoglobulin G (Ig G/Quanti)",
    "immunaqlobinm1qmquantl": "Immunoglobulin M (Ig M/Quanti)",
    "lquidbasecytoloqylbc": "Liquid Base Cytology (LBC)",
    "measeslqg": "Measles IgG",
    "heasesiqh": "Measles IgM",
    "measesiqh": "Measles IgM",
    "ngnetslerlaqonorrhoeae": "NG (Neisseria gonorrhoeae)",
    "praalatoninquall": "Procalcitonin (Quali)",
    "thyraqlobulin": "Thyroglobulin",
    "thyraqlobullinantibady": "Thyroglobulin antibody",
    "ucgpreqnancytest": "UCG (pregnancy test)",
    "asoqut": "ASO (Quti)",
    "as0qut": "ASO (Quti)",
    "bloodcentrifuqstion": "Blood Centrifugation",
    "coheterllmtonfoe": "Catheterization Fee",
    "cfroes": "CF Fees",
    "cffoes": "CF Fees",
    "phonebl1": "Phone Bill",
    "prode": "Probe",
    "repktrstionfee": "Registration Fee",
    "rtwrkt": "RT Wrist",
    "covidantibady": "Covid Antibody",
    "covidtestswsb": "Covid Test (Swab)",
    "soope": "Scope",
    "oxyqen": "Oxygen",
    "pocksqe": "Package",
    "sunossa": "Discount",
    "sunooaa": "Discount",
    "dkc0unt30": "Discount 30%",
    "unwap": "Discount",
    "estrsdloe2": "Estradiol (E2)",
    "fadorvill": "Factor VIII",
    "facdorix": "Factor IX",
    "ekoctrolytes": "Electrolytes",
    "eoanophilcount": "Eosinophil count",
    "ferritn": "Ferritin",
    "pvka2": "Pivka 2",
    "plateetcount": "Platelet count",
    "urne": "Urine",
    "denqueloqigmnklaa": "Dengue IgG+IgM+NS1 Ag",
}


def compact(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def apply_fix(text: str) -> str | None:
    key = compact(text)
    if key in FIXES:
        return FIXES[key]
    # prefix/contains soft matches for discount garbage
    if "discount" in key or key.startswith("dkcount") or key.startswith("diccount"):
        if "10" in key:
            return "Discount 10%"
        if "20" in key:
            return "Discount 20%"
        if "30" in key:
            return "Discount 30%"
        if "50" in key:
            return "Discount 50%"
        return "Discount"
    return None
