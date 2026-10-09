import { useEffect, useState } from "react";

/** Lightweight EN / Myanmar UI strings — no i18n framework. */

export type Locale = "en" | "my";

const LOCALE_KEY = "mudita_locale";

const listeners = new Set<() => void>();

export function getLocale(): Locale {
  const v = localStorage.getItem(LOCALE_KEY);
  return v === "my" ? "my" : "en";
}

export function setLocale(locale: Locale): void {
  localStorage.setItem(LOCALE_KEY, locale);
  document.documentElement.lang = locale === "my" ? "my" : "en";
  document.documentElement.dataset.locale = locale;
  listeners.forEach((fn) => fn());
}

export function subscribeLocale(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

type Dict = Record<string, string>;

const en: Dict = {
  brand: "Mudita Hospital",
  home: "Home",
  settings: "Settings",
  pharmacy: "Pharmacy",
  pharmacyStock: "Pharmacy Stock",
  pharmacyBilling: "Pharmacy Billing",
  opd: "OPD",
  ot: "OT",
  reports: "Reports",
  help: "Help",
  signIn: "Sign in",
  logOut: "Log out",
  changePassword: "Change password",
  serverIp: "Server IP",
  serverConnected: "Server connected",
  serverOffline: "Server offline",
  checking: "Checking…",
  retry: "Retry",
  changeServerIp: "Change server IP",
  username: "Username",
  password: "Password",
  signingIn: "Signing in…",
  back: "← Back",
  print: "Print",
  language: "Language",
  english: "English",
  myanmar: "မြန်မာ",
  tileOpdSub: "Services · consult · cash",
  tileOtSub: "Issue · reconcile · bill",
  tilePharmacySub: "Units · restock · history",
  tilePharmacyBillingSub: "Medicines · cash · print",
  tileSettingsSub: "Hospital · doctors · users",
  tileReportsSub: "Cash · stock · expiry",
  tileHelpSub: "Shortcuts · cheat sheet",
  noAccess: "No access",
  restoringSession: "Restoring session…",
  offlineLan: "Offline LAN · roles Admin / Reception / Pharmacy",
  loginHint: "Defaults: admin / admin123 (must change). Demo: reception / reception123",
  reportDailyCash: "Daily cash",
  reportLowStock: "Low stock",
  reportNearExpiry: "Near expiry",
  reportDate: "Date",
  daysAhead: "Days ahead",
  load: "Load",
  opdBills: "OPD bills",
  otBills: "OT bills",
  pharmacyBills: "Pharmacy bills",
  grandTotal: "Grand total",
  noPaidBills: "No paid bills on this date.",
  noLowStock: "No low-stock items.",
  noNearExpiry: "No batches near expiry.",
  stock: "Stock",
  reorder: "Reorder",
  deficit: "Deficit",
  expiry: "Expiry",
  qty: "Qty",
  code: "Code",
  name: "Name",
  category: "Category",
  location: "Location",
  batch: "Batch",
  daysLeft: "Days left",
  source: "Source",
  bill: "Bill",
  patient: "Patient",
  doctor: "Doctor",
  paid: "Paid",
  mmk: "MMK",
  training: "Training",
  trainingTitle: "Training / demo mode",
  trainingLede:
    "Seeds DEMO- items, a training doctor/service, sample OPD + Pharmacy bills for cash-report practice. Does not touch real users or non-DEMO catalog.",
  seedTraining: "Seed training data",
  resetTraining: "Reset & re-seed training",
  trainingStatus: "Training status",
  seeded: "Seeded",
  notSeeded: "Not seeded",
  confirmReset:
    "Reset training data?\n\nRemoves DEMO- items, [TRAINING] bills/cases, then re-seeds. Real hospital data outside DEMO-/[TRAINING] is kept.",
  helpTitle: "Shortcuts & cheat sheet",
  helpLede: "Laminate this page for the reception desk. Press ? anytime for help.",
  printCheatSheet: "Print cheat sheet",
  close: "Close",
  hospital: "Hospital",
  doctors: "Doctors",
  services: "Services",
  users: "Users",
  backup: "Backup",
  clientServerIp: "Client server IP…",
  busy: "Working…",
  done: "Done",
  error: "Error",
};

const my: Dict = {
  brand: "မုဒိတာ ဆေးရုံ",
  home: "ပင်မစာမျက်နှာ",
  settings: "ဆက်တင်",
  pharmacy: "ဆေးဆိုင်",
  pharmacyStock: "ဆေးဆိုင် စတော့",
  pharmacyBilling: "ဆေးဆိုင် ဘေလ်",
  opd: "ပြင်ပလူနာ",
  ot: "ခွဲစိတ်ခန်း",
  reports: "အစီရင်ခံစာ",
  help: "အကူအညီ",
  signIn: "ဝင်ရန်",
  logOut: "ထွက်ရန်",
  changePassword: "စကားဝှက်ပြောင်းရန်",
  serverIp: "ဆာဗာ IP",
  serverConnected: "ဆာဗာ ချိတ်ဆက်ပြီး",
  serverOffline: "ဆာဗာ မရရှိ",
  checking: "စစ်ဆေးနေသည်…",
  retry: "ထပ်ကြိုးစား",
  changeServerIp: "ဆာဗာ IP ပြောင်း",
  username: "အသုံးပြုသူအမည်",
  password: "စကားဝှက်",
  signingIn: "ဝင်နေသည်…",
  back: "← ပြန်",
  print: "ပရင့်",
  language: "ဘာသာစကား",
  english: "English",
  myanmar: "မြန်မာ",
  tileOpdSub: "ဝန်ဆောင်မှု · ငွေသား",
  tileOtSub: "ထုတ် · စစ်ဆေး · ဘေလ်",
  tilePharmacySub: "ယူနစ် · ထပ်သွင်း · မှတ်တမ်း",
  tilePharmacyBillingSub: "ဆေး · ငွေသား · ပရင့်",
  tileSettingsSub: "ဆေးရုံ · ဆရာဝန် · အသုံးပြုသူ",
  tileReportsSub: "ငွေ · စတော့ · သက်တမ်း",
  tileHelpSub: "လမ်းညွှန် · အတိုကောက်",
  noAccess: "ဝင်ခွင့်မရှိ",
  restoringSession: "စက်ရှင် ပြန်ဖွင့်နေသည်…",
  offlineLan: "LAN အော့ဖ်လိုင်း · Admin / Reception / Pharmacy",
  loginHint: "ပုံမှန်: admin / admin123။ စမ်းသပ်: reception / reception123",
  reportDailyCash: "နေ့စဉ်ငွေစု",
  reportLowStock: "စတော့နည်း",
  reportNearExpiry: "သက်တမ်းနီး",
  reportDate: "ရက်စွဲ",
  daysAhead: "ရက်အရေအတွက်",
  load: "ဖွင့်ရန်",
  opdBills: "OPD ဘေလ်များ",
  otBills: "OT ဘေလ်များ",
  pharmacyBills: "ဆေးဆိုင် ဘေလ်များ",
  grandTotal: "စုစုပေါင်း",
  noPaidBills: "ဤနေ့တွင် ပေးပြီးဘေလ် မရှိပါ။",
  noLowStock: "စတော့နည်း ပစ္စည်း မရှိပါ။",
  noNearExpiry: "သက်တမ်းနီး batch မရှိပါ။",
  stock: "စတော့",
  reorder: "ပြန်မှာအဆင့်",
  deficit: "လိုအပ်",
  expiry: "သက်တမ်းကုန်",
  qty: "အရေအတွက်",
  code: "ကုဒ်",
  name: "အမည်",
  category: "အမျိုးအစား",
  location: "တည်နေရာ",
  batch: "အသုတ်",
  daysLeft: "ကျန်ရက်",
  source: "အရင်းအမြစ်",
  bill: "ဘေလ်",
  patient: "လူနာ",
  doctor: "ဆရာဝန်",
  paid: "ပေးပြီး",
  mmk: "ကျပ်",
  training: "လေ့ကျင့်",
  trainingTitle: "လေ့ကျင့် / ဒီမို မုဒ်",
  trainingLede:
    "DEMO- ပစ္စည်းများ၊ လေ့ကျင့်ဆရာဝန်/ဝန်ဆောင်မှု၊ နှင့် ယနေ့နမူနာ OPD ဘေလ် ထည့်သည်။ အသုံးပြုသူနှင့် DEMO မဟုတ်သော ဒေတာကို မထိပါ။",
  seedTraining: "လေ့ကျင့်ဒေတာ ထည့်ရန်",
  resetTraining: "ပြန်သန့်ပြီး ထပ်ထည့်",
  trainingStatus: "လေ့ကျင့် အခြေအနေ",
  seeded: "ထည့်ပြီး",
  notSeeded: "မထည့်ရသေး",
  confirmReset:
    "လေ့ကျင့်ဒေတာ ပြန်သန့်မည်လား?\n\nDEMO- ပစ္စည်းနှင့် [TRAINING] ဘေလ်/ကေ့စ် ဖျက်ပြီး ထပ်ထည့်သည်။ အခြားဆေးရုံဒေတာ ထိန်းသိမ်းသည်။",
  helpTitle: "အတိုကောက်နှင့် လမ်းညွှန်",
  helpLede: "လက်ခံကောင်တာအတွက် ဤစာမျက်နှာကို လာမီနိတ်လုပ်ပါ။ အကူအညီအတွက် ? နှိပ်ပါ။",
  printCheatSheet: "လမ်းညွှန် ပရင့်",
  close: "ပိတ်ရန်",
  hospital: "ဆေးရုံ",
  doctors: "ဆရာဝန်များ",
  services: "ဝန်ဆောင်မှုများ",
  users: "အသုံးပြုသူများ",
  backup: "အရန်သိမ်း",
  clientServerIp: "ကလိုင်းယင့် ဆာဗာ IP…",
  busy: "လုပ်ဆောင်နေသည်…",
  done: "ပြီးပါပြီ",
  error: "အမှား",
};

const tables: Record<Locale, Dict> = { en, my };

export function t(key: string): string {
  const locale = getLocale();
  return tables[locale][key] ?? tables.en[key] ?? key;
}

/** Re-renders when locale changes. */
export function useI18n(): { locale: Locale; setLocale: (l: Locale) => void; t: (key: string) => string } {
  const [locale, setLoc] = useState<Locale>(() => getLocale());
  useEffect(() => {
    document.documentElement.lang = locale === "my" ? "my" : "en";
    document.documentElement.dataset.locale = locale;
    return subscribeLocale(() => setLoc(getLocale()));
  }, [locale]);
  return {
    locale,
    setLocale: (l: Locale) => {
      setLocale(l);
      setLoc(l);
    },
    t,
  };
}

// Apply on module load
if (typeof document !== "undefined") {
  const loc = getLocale();
  document.documentElement.lang = loc === "my" ? "my" : "en";
  document.documentElement.dataset.locale = loc;
}
