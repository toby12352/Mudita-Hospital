import { apiFetch } from "./api";

export type DashOverview = {
  date: string;
  opd_count: number;
  opd_total_mmk: number;
  ot_count: number;
  ot_total_mmk: number;
  grand_total_mmk: number;
  bill_count: number;
  avg_bill_mmk: number;
  voids_today: number;
  low_stock_count: number;
  near_expiry_count: number;
  near_expiry_days: number;
};

export type TrendPoint = {
  date: string;
  opd_total_mmk: number;
  ot_total_mmk: number;
  grand_total_mmk: number;
  bill_count: number;
};

export type TrendsResponse = {
  from: string;
  to: string;
  days: number;
  points: TrendPoint[];
};

export type DoctorRevenueRow = {
  doctor_id: number;
  doctor_name: string;
  bill_count: number;
  total_mmk: number;
};

export type ServiceRevenueRow = {
  line_type: string;
  code: string;
  description: string;
  qty: number;
  total_mmk: number;
};

export type PharmacyItemMargin = {
  item_id: number;
  code: string;
  name: string;
  qty_sold: number;
  revenue_mmk: number;
  cogs_mmk: number;
  margin_mmk: number;
};

export type PharmacyMarginReport = {
  from: string;
  to: string;
  note: string;
  revenue_mmk: number;
  cogs_mmk: number;
  margin_mmk: number;
  cogs_pct: number;
  margin_pct: number;
  top_by_revenue: PharmacyItemMargin[];
  top_by_margin: PharmacyItemMargin[];
};

export type RangeDays = 7 | 30 | 90;

export async function fetchDashOverview(date?: string): Promise<DashOverview> {
  const q = date ? `?date=${encodeURIComponent(date)}` : "";
  return apiFetch<DashOverview>(`/api/dashboard/overview${q}`);
}

export async function fetchTrends(days: RangeDays): Promise<TrendsResponse> {
  return apiFetch<TrendsResponse>(`/api/dashboard/trends?days=${days}`);
}

export async function fetchRevenueByDoctor(
  days: RangeDays,
): Promise<{ from: string; to: string; days: number; rows: DoctorRevenueRow[]; count: number }> {
  return apiFetch(`/api/dashboard/revenue-by-doctor?days=${days}`);
}

export async function fetchRevenueByService(
  days: RangeDays,
): Promise<{ from: string; to: string; days: number; rows: ServiceRevenueRow[]; count: number }> {
  return apiFetch(`/api/dashboard/revenue-by-service?days=${days}`);
}

export async function fetchPharmacyMargin(days: RangeDays): Promise<PharmacyMarginReport> {
  return apiFetch<PharmacyMarginReport>(`/api/dashboard/pharmacy-margin?days=${days}`);
}

export type StockLocValue = {
  location_code: string;
  qty: number;
  value_mmk: number;
};

export type ExpiryBucket = {
  key: string;
  label: string;
  batches: number;
  qty: number;
  value_mmk: number;
};

export type SlowMoverRow = {
  item_id: number;
  code: string;
  name: string;
  qty_on_hand: number;
  value_mmk: number;
  last_sale_date?: string;
  days_since_sale?: number;
};

export type LowStockRow = {
  id: number;
  code: string;
  name: string;
  category: string;
  stock_main: number;
  reorder_level: number;
  deficit: number;
};

export type StockHealthReport = {
  as_of: string;
  note: string;
  total_value_mmk: number;
  total_qty: number;
  by_location: StockLocValue[];
  low_stock_count: number;
  low_stock: LowStockRow[];
  expiry_buckets: ExpiryBucket[];
  value_at_risk_mmk: number;
  near_expiry_count: number;
  slow_days: number;
  slow_movers: SlowMoverRow[];
  slow_mover_count: number;
  cogs_days: number;
  cogs_period_mmk: number;
  turns_estimate: number;
  turns_note: string;
};

export type DailyCashLine = {
  source: string;
  bill_no: string;
  patient: string;
  doctor: string;
  total_mmk: number;
  paid_at: string;
  paid_by_name: string;
};

export type DailyReportResponse = {
  date: string;
  yesterday: string;
  opd_count: number;
  opd_total_mmk: number;
  ot_count: number;
  ot_total_mmk: number;
  grand_total_mmk: number;
  bill_count: number;
  voids: number;
  lines: DailyCashLine[];
  prev_opd_total_mmk: number;
  prev_ot_total_mmk: number;
  prev_grand_total_mmk: number;
  prev_bill_count: number;
  delta_opd_mmk: number;
  delta_ot_mmk: number;
  delta_grand_mmk: number;
  delta_bills: number;
};

export async function fetchStockHealth(opts?: {
  slowDays?: number;
  cogsDays?: RangeDays;
}): Promise<StockHealthReport> {
  const slow = opts?.slowDays ?? 90;
  const cogs = opts?.cogsDays ?? 30;
  return apiFetch<StockHealthReport>(
    `/api/dashboard/stock?slow_days=${slow}&cogs_days=${cogs}`,
  );
}

export async function fetchDailyReport(date: string): Promise<DailyReportResponse> {
  return apiFetch<DailyReportResponse>(
    `/api/dashboard/daily-report?date=${encodeURIComponent(date)}`,
  );
}
