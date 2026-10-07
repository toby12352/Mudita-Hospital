export type PageId = "overview" | "revenue" | "stock" | "daily" | "master" | "audit";

export const PAGE_TITLE_KEY: Record<PageId, string> = {
  overview: "overview",
  revenue: "revenue",
  stock: "stock",
  daily: "dailyReport",
  master: "masterData",
  audit: "audit",
};
