package handlers

import (
	"database/sql"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"mudita-hospital/server/internal/auth"
	"mudita-hospital/server/internal/middleware"
)

// Dashboard serves analytics under /api/dashboard/.
// Admin, or a unified account with the dashboard grant, may call it.
// The grant does not open clinic settings or user management.
type Dashboard struct {
	DB *sql.DB
}

func (h *Dashboard) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	middleware.RequireAuth(h.DB, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user := middleware.UserFromContext(r.Context())
		if user == nil {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
			return
		}
		// dashboard is its own grant. It does not satisfy settings.
		ok, err := auth.Allow(h.DB, user.ID, auth.GrantDashboard)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "permission check failed"})
			return
		}
		if !ok {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
			return
		}
		path := strings.TrimPrefix(r.URL.Path, "/api/dashboard")
		path = strings.TrimSuffix(path, "/")
		if path == "" {
			path = "/"
		}

		switch {
		case path == "/overview" && r.Method == http.MethodGet:
			h.overview(w, r)
		case path == "/trends" && r.Method == http.MethodGet:
			h.trends(w, r)
		case path == "/revenue-by-doctor" && r.Method == http.MethodGet:
			h.revenueByDoctor(w, r)
		case path == "/revenue-by-service" && r.Method == http.MethodGet:
			h.revenueByService(w, r)
		case path == "/pharmacy-margin" && r.Method == http.MethodGet:
			h.pharmacyMargin(w, r)
		case path == "/stock" && r.Method == http.MethodGet:
			h.stock(w, r)
		case path == "/daily-report" && r.Method == http.MethodGet:
			h.dailyReport(w, r)
		case path == "/daily-report/print" && r.Method == http.MethodGet:
			h.dailyReportPrint(w, r)
		case path == "/audit" && r.Method == http.MethodGet:
			h.listAudit(w, r)
		case path == "/bulk/items" && r.Method == http.MethodPost:
			h.bulkItems(w, r)
		case path == "/bulk/services" && r.Method == http.MethodPost:
			h.bulkServices(w, r)
		case path == "/bulk/doctors" && r.Method == http.MethodPost:
			h.bulkDoctors(w, r)
		case path == "/export/items" && r.Method == http.MethodGet:
			h.exportItemsCSV(w, r)
		case path == "/export/services" && r.Method == http.MethodGet:
			h.exportServicesCSV(w, r)
		case path == "/export/doctors" && r.Method == http.MethodGet:
			h.exportDoctorsCSV(w, r)
		case path == "/import/items" && r.Method == http.MethodPost:
			h.importItemsCSV(w, r)
		case path == "/import/services" && r.Method == http.MethodPost:
			h.importServicesCSV(w, r)
		case path == "/import/doctors" && r.Method == http.MethodPost:
			h.importDoctorsCSV(w, r)
		default:
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		}
	})).ServeHTTP(w, r)
}

type dashOverview struct {
	Date             string `json:"date"`
	OPDCount         int    `json:"opd_count"`
	OPDTotalMMK      int64  `json:"opd_total_mmk"`
	OTCount          int    `json:"ot_count"`
	OTTotalMMK       int64  `json:"ot_total_mmk"`
	PharmacyCount    int    `json:"pharmacy_count"`
	PharmacyTotalMMK int64  `json:"pharmacy_total_mmk"`
	LabCount         int    `json:"lab_count"`
	LabTotalMMK      int64  `json:"lab_total_mmk"`
	GrandTotalMMK    int64  `json:"grand_total_mmk"`
	BillCount        int    `json:"bill_count"`
	AvgBillMMK       int64  `json:"avg_bill_mmk"`
	VoidsToday       int    `json:"voids_today"`
	LowStockCount    int    `json:"low_stock_count"`
	NearExpiryCount  int    `json:"near_expiry_count"`
	NearExpiryDays   int    `json:"near_expiry_days"`
	IpdCashMMK       int64  `json:"ipd_cash_mmk"`
	IncomeMMK        int64  `json:"income_mmk"`
	ExpenseMMK       int64  `json:"expense_mmk"`
	NetCashMMK       int64  `json:"net_cash_mmk"`
}

type trendPoint struct {
	Date             string `json:"date"`
	OPDTotalMMK      int64  `json:"opd_total_mmk"`
	OTTotalMMK       int64  `json:"ot_total_mmk"`
	PharmacyTotalMMK int64  `json:"pharmacy_total_mmk"`
	LabTotalMMK      int64  `json:"lab_total_mmk"`
	GrandTotalMMK    int64  `json:"grand_total_mmk"`
	BillCount        int    `json:"bill_count"`
	IpdCashMMK       int64  `json:"ipd_cash_mmk"`
	IncomeMMK        int64  `json:"income_mmk"`
	ExpenseMMK       int64  `json:"expense_mmk"`
	NetCashMMK       int64  `json:"net_cash_mmk"`
}

type doctorRevenueRow struct {
	DoctorID   int64  `json:"doctor_id"`
	DoctorName string `json:"doctor_name"`
	BillCount  int    `json:"bill_count"`
	TotalMMK   int64  `json:"total_mmk"`
}

type serviceRevenueRow struct {
	LineType    string `json:"line_type"`
	Code        string `json:"code"`
	Description string `json:"description"`
	Qty         int64  `json:"qty"`
	TotalMMK    int64  `json:"total_mmk"`
}

type pharmacyItemMargin struct {
	ItemID     int64  `json:"item_id"`
	Code       string `json:"code"`
	Name       string `json:"name"`
	QtySold    int64  `json:"qty_sold"`
	RevenueMMK int64  `json:"revenue_mmk"`
	COGSMMK    int64  `json:"cogs_mmk"`
	MarginMMK  int64  `json:"margin_mmk"`
}

type pharmacyMarginReport struct {
	From         string               `json:"from"`
	To           string               `json:"to"`
	Note         string               `json:"note"`
	RevenueMMK   int64                `json:"revenue_mmk"`
	COGSMMK      int64                `json:"cogs_mmk"`
	MarginMMK    int64                `json:"margin_mmk"`
	COGSPct      float64              `json:"cogs_pct"`
	MarginPct    float64              `json:"margin_pct"`
	TopByRevenue []pharmacyItemMargin `json:"top_by_revenue"`
	TopByMargin  []pharmacyItemMargin `json:"top_by_margin"`
}

func (h *Dashboard) overview(w http.ResponseWriter, r *http.Request) {
	date := reportDate(r)
	move, err := buildCashMovement(h.DB, date)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "overview failed"})
		return
	}
	low, err := listLowStock(h.DB)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "overview failed"})
		return
	}
	nearDays := 60
	near, err := listLiveNearExpiry(h.DB, nearDays)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "overview failed"})
		return
	}
	voids, err := countVoidsOnDate(h.DB, date)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "overview failed"})
		return
	}
	cash := move.Desk
	billCount := cash.OPDCount + cash.OTCount + cash.PharmacyCount + cash.LabCount
	var avg int64
	if billCount > 0 {
		avg = cash.GrandTotal / int64(billCount)
	}
	writeJSON(w, http.StatusOK, dashOverview{
		Date:             date,
		OPDCount:         cash.OPDCount,
		OPDTotalMMK:      cash.OPDTotal,
		OTCount:          cash.OTCount,
		OTTotalMMK:       cash.OTTotal,
		PharmacyCount:    cash.PharmacyCount,
		PharmacyTotalMMK: cash.PharmacyTotal,
		LabCount:         cash.LabCount,
		LabTotalMMK:      cash.LabTotal,
		GrandTotalMMK:    cash.GrandTotal,
		BillCount:        billCount,
		AvgBillMMK:       avg,
		VoidsToday:       voids,
		LowStockCount:    len(low),
		NearExpiryCount:  len(near),
		NearExpiryDays:   nearDays,
		IpdCashMMK:       move.IPD.NetMMK,
		IncomeMMK:        move.IncomeMMK,
		ExpenseMMK:       move.ExpenseMMK,
		NetCashMMK:       move.NetCashMMK,
	})
}

func (h *Dashboard) trends(w http.ResponseWriter, r *http.Request) {
	from, to, days, err := parseDashRange(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	points, err := buildCashTrends(h.DB, from, to)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "trends failed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"from":   from,
		"to":     to,
		"days":   days,
		"points": points,
	})
}

func (h *Dashboard) revenueByDoctor(w http.ResponseWriter, r *http.Request) {
	from, to, days, err := parseDashRange(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	rows, err := buildRevenueByDoctor(h.DB, from, to)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "revenue-by-doctor failed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"from":  from,
		"to":    to,
		"days":  days,
		"rows":  rows,
		"count": len(rows),
	})
}

func (h *Dashboard) revenueByService(w http.ResponseWriter, r *http.Request) {
	from, to, days, err := parseDashRange(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	rows, err := buildRevenueByService(h.DB, from, to)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "revenue-by-service failed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"from":  from,
		"to":    to,
		"days":  days,
		"rows":  rows,
		"count": len(rows),
	})
}

func (h *Dashboard) pharmacyMargin(w http.ResponseWriter, r *http.Request) {
	from, to, days, err := parseDashRange(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	rep, err := buildPharmacyMargin(h.DB, from, to)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "pharmacy-margin failed"})
		return
	}
	_ = days
	writeJSON(w, http.StatusOK, rep)
}

type stockLocValue struct {
	LocationCode string `json:"location_code"`
	Qty          int64  `json:"qty"`
	ValueMMK     int64  `json:"value_mmk"`
}

type expiryBucket struct {
	Key      string `json:"key"` // expired | d30 | d60 | d90
	Label    string `json:"label"`
	Batches  int    `json:"batches"`
	Qty      int64  `json:"qty"`
	ValueMMK int64  `json:"value_mmk"`
}

type slowMoverRow struct {
	ItemID        int64  `json:"item_id"`
	Code          string `json:"code"`
	Name          string `json:"name"`
	QtyOnHand     int64  `json:"qty_on_hand"`
	ValueMMK      int64  `json:"value_mmk"`
	LastSaleDate  string `json:"last_sale_date,omitempty"`
	DaysSinceSale *int   `json:"days_since_sale,omitempty"`
}

type stockHealthReport struct {
	AsOf            string          `json:"as_of"`
	Note            string          `json:"note"`
	TotalValueMMK   int64           `json:"total_value_mmk"`
	TotalQty        int64           `json:"total_qty"`
	ByLocation      []stockLocValue `json:"by_location"`
	LowStockCount   int             `json:"low_stock_count"`
	LowStock        []lowStockRow   `json:"low_stock"`
	ExpiryBuckets   []expiryBucket  `json:"expiry_buckets"`
	ValueAtRiskMMK  int64           `json:"value_at_risk_mmk"`
	NearExpiryCount int             `json:"near_expiry_count"`
	SlowDays        int             `json:"slow_days"`
	SlowMovers      []slowMoverRow  `json:"slow_movers"`
	SlowMoverCount  int             `json:"slow_mover_count"`
	CogsDays        int             `json:"cogs_days"`
	CogsPeriodMMK   int64           `json:"cogs_period_mmk"`
	TurnsEstimate   float64         `json:"turns_estimate"`
	TurnsNote       string          `json:"turns_note"`
}

type dailyReportResponse struct {
	Date              string            `json:"date"`
	Yesterday         string            `json:"yesterday"`
	OPDCount          int               `json:"opd_count"`
	OPDTotalMMK       int64             `json:"opd_total_mmk"`
	OTCount           int               `json:"ot_count"`
	OTTotalMMK        int64             `json:"ot_total_mmk"`
	PharmacyCount     int               `json:"pharmacy_count"`
	PharmacyTotalMMK  int64             `json:"pharmacy_total_mmk"`
	LabCount          int               `json:"lab_count"`
	LabTotalMMK       int64             `json:"lab_total_mmk"`
	GrandTotalMMK     int64             `json:"grand_total_mmk"`
	BillCount         int               `json:"bill_count"`
	Voids             int               `json:"voids"`
	Lines             []cashLine        `json:"lines"`
	PrevOPDTotal      int64             `json:"prev_opd_total_mmk"`
	PrevOTTotal       int64             `json:"prev_ot_total_mmk"`
	PrevPharmacyTotal int64             `json:"prev_pharmacy_total_mmk"`
	PrevLabTotal      int64             `json:"prev_lab_total_mmk"`
	PrevGrandTotal    int64             `json:"prev_grand_total_mmk"`
	PrevBillCount     int               `json:"prev_bill_count"`
	DeltaOPDMMK       int64             `json:"delta_opd_mmk"`
	DeltaOTMMK        int64             `json:"delta_ot_mmk"`
	DeltaPharmacyMMK  int64             `json:"delta_pharmacy_mmk"`
	DeltaLabMMK       int64             `json:"delta_lab_mmk"`
	DeltaGrandMMK     int64             `json:"delta_grand_mmk"`
	DeltaBills        int               `json:"delta_bills"`
	IncomeMMK         int64             `json:"income_mmk"`
	ExpenseMMK        int64             `json:"expense_mmk"`
	NetCashMMK        int64             `json:"net_cash_mmk"`
	PrevIncomeMMK     int64             `json:"prev_income_mmk"`
	PrevExpenseMMK    int64             `json:"prev_expense_mmk"`
	PrevNetCashMMK    int64             `json:"prev_net_cash_mmk"`
	DeltaIncomeMMK    int64             `json:"delta_income_mmk"`
	DeltaExpenseMMK   int64             `json:"delta_expense_mmk"`
	DeltaNetCashMMK   int64             `json:"delta_net_cash_mmk"`
	IpdCashMMK           int64             `json:"ipd_cash_mmk"`
	IpdLines             []ipdCashLine     `json:"ipd_lines"`
	IpdEarnedMMK         int64             `json:"ipd_earned_mmk"`
	IpdEarnedLines       []ipdCashLine     `json:"ipd_earned_lines"`
	IpdOpenStays         []ipdOpenStayRow  `json:"ipd_open_stays"`
	IpdOwedToPatientsMMK int64             `json:"ipd_owed_to_patients_mmk"`
	IpdOwedByPatientsMMK int64             `json:"ipd_owed_by_patients_mmk"`
	ExpenseLines         []expenseCashLine `json:"expense_lines"`
}

func (h *Dashboard) stock(w http.ResponseWriter, r *http.Request) {
	slowDays := 90
	if v := strings.TrimSpace(r.URL.Query().Get("slow_days")); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 7 || n > 365 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "slow_days must be 7–365"})
			return
		}
		slowDays = n
	}
	cogsDays := 30
	if v := strings.TrimSpace(r.URL.Query().Get("cogs_days")); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || (n != 7 && n != 30 && n != 90) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "cogs_days must be 7, 30, or 90"})
			return
		}
		cogsDays = n
	}
	rep, err := buildStockHealth(h.DB, slowDays, cogsDays)
	if err != nil {
		log.Printf("dashboard stock: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "stock failed"})
		return
	}
	writeJSON(w, http.StatusOK, rep)
}

func (h *Dashboard) dailyReport(w http.ResponseWriter, r *http.Request) {
	date := reportDate(r)
	dateT, err := time.Parse("2006-01-02", date)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "date must be YYYY-MM-DD"})
		return
	}
	yesterday := dateT.AddDate(0, 0, -1).Format("2006-01-02")

	today, err := buildCashMovement(h.DB, date)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "daily-report failed"})
		return
	}
	prev, err := buildCashMovement(h.DB, yesterday)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "daily-report failed"})
		return
	}
	voids, err := countVoidsOnDate(h.DB, date)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "daily-report failed"})
		return
	}
	cash := today.Desk
	prevCash := prev.Desk
	billCount := cash.OPDCount + cash.OTCount + cash.PharmacyCount + cash.LabCount
	prevBills := prevCash.OPDCount + prevCash.OTCount + prevCash.PharmacyCount + prevCash.LabCount
	writeJSON(w, http.StatusOK, dailyReportResponse{
		Date:              date,
		Yesterday:         yesterday,
		OPDCount:          cash.OPDCount,
		OPDTotalMMK:       cash.OPDTotal,
		OTCount:           cash.OTCount,
		OTTotalMMK:        cash.OTTotal,
		PharmacyCount:     cash.PharmacyCount,
		PharmacyTotalMMK:  cash.PharmacyTotal,
		LabCount:          cash.LabCount,
		LabTotalMMK:       cash.LabTotal,
		GrandTotalMMK:     cash.GrandTotal,
		BillCount:         billCount,
		Voids:             voids,
		Lines:             cash.Lines,
		PrevOPDTotal:      prevCash.OPDTotal,
		PrevOTTotal:       prevCash.OTTotal,
		PrevPharmacyTotal: prevCash.PharmacyTotal,
		PrevLabTotal:      prevCash.LabTotal,
		PrevGrandTotal:    prevCash.GrandTotal,
		PrevBillCount:     prevBills,
		DeltaOPDMMK:       cash.OPDTotal - prevCash.OPDTotal,
		DeltaOTMMK:        cash.OTTotal - prevCash.OTTotal,
		DeltaPharmacyMMK:  cash.PharmacyTotal - prevCash.PharmacyTotal,
		DeltaLabMMK:       cash.LabTotal - prevCash.LabTotal,
		DeltaGrandMMK:     cash.GrandTotal - prevCash.GrandTotal,
		DeltaBills:        billCount - prevBills,
		IncomeMMK:         today.IncomeMMK,
		ExpenseMMK:        today.ExpenseMMK,
		NetCashMMK:        today.NetCashMMK,
		PrevIncomeMMK:     prev.IncomeMMK,
		PrevExpenseMMK:    prev.ExpenseMMK,
		PrevNetCashMMK:    prev.NetCashMMK,
		DeltaIncomeMMK:    today.IncomeMMK - prev.IncomeMMK,
		DeltaExpenseMMK:   today.ExpenseMMK - prev.ExpenseMMK,
		DeltaNetCashMMK:   today.NetCashMMK - prev.NetCashMMK,
		IpdCashMMK:           today.IPD.NetMMK,
		IpdLines:             today.IPD.Lines,
		IpdEarnedMMK:         today.IPDEarned.EarnedMMK,
		IpdEarnedLines:       today.IPDEarned.Lines,
		IpdOpenStays:         today.OpenStays.Stays,
		IpdOwedToPatientsMMK: today.OpenStays.OwedToPatientsMMK,
		IpdOwedByPatientsMMK: today.OpenStays.OwedByPatientsMMK,
		ExpenseLines:         today.ExpenseLines,
	})
}

// dailyReportPrint is the admin HTML for one civil day.
// Clinic desks stay on GET /api/reports/daily-cash/print, which is role-scoped
// and does not include IPD or hospital expenses.
// Optional kind=income|expense|overall (default overall) selects the sheet.
func (h *Dashboard) dailyReportPrint(w http.ResponseWriter, r *http.Request) {
	date := reportDate(r)
	kind := strings.TrimSpace(r.URL.Query().Get("kind"))
	if kind == "" {
		kind = "overall"
	}
	switch kind {
	case "income", "expense", "overall":
	default:
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "kind must be income, expense, or overall"})
		return
	}
	move, err := buildCashMovement(h.DB, date)
	if err != nil {
		http.Error(w, "report failed", http.StatusInternalServerError)
		return
	}
	hosp, _ := loadHospitalSettings(h.DB)
	if hosp == nil {
		hosp = &hospitalSettings{HospitalName: "Mudita Hospital"}
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(renderDashboardDailyHTML(hosp, move, kind)))
}

func buildStockHealth(db *sql.DB, slowDays, cogsDays int) (*stockHealthReport, error) {
	asOf := time.Now().Format("2006-01-02")
	byLoc, totalQty, totalValue, err := stockValueByLocation(db)
	if err != nil {
		return nil, err
	}
	low, err := listLowStock(db)
	if err != nil {
		return nil, err
	}
	buckets, valueAtRisk, nearCount, err := buildExpiryBuckets(db, asOf)
	if err != nil {
		return nil, err
	}
	slow, err := listSlowMovers(db, slowDays, asOf)
	if err != nil {
		return nil, err
	}
	toT, _ := time.Parse("2006-01-02", asOf)
	from := toT.AddDate(0, 0, -(cogsDays - 1)).Format("2006-01-02")
	margin, err := buildPharmacyMargin(db, from, asOf)
	if err != nil {
		return nil, err
	}
	var turns float64
	if totalValue > 0 {
		turns = float64(margin.COGSMMK) / float64(totalValue)
	}
	return &stockHealthReport{
		AsOf:            asOf,
		Note:            "Inventory valued at current item buy prices × on-hand qty (MAIN pharmacy and the OT cupboard). Legacy OT_RESERVED and OT_FLOOR rows are not counted.",
		TotalValueMMK:   totalValue,
		TotalQty:        totalQty,
		ByLocation:      byLoc,
		LowStockCount:   len(low),
		LowStock:        low,
		ExpiryBuckets:   buckets,
		ValueAtRiskMMK:  valueAtRisk,
		NearExpiryCount: nearCount,
		SlowDays:        slowDays,
		SlowMovers:      slow,
		SlowMoverCount:  len(slow),
		CogsDays:        cogsDays,
		CogsPeriodMMK:   margin.COGSMMK,
		TurnsEstimate:   turns,
		TurnsNote:       "Simple turns ≈ pharmacy COGS (period) ÷ current stock value at buy price.",
	}, nil
}

func stockValueByLocation(db *sql.DB) ([]stockLocValue, int64, int64, error) {
	rows, err := db.Query(`
		SELECT location_code,
		       COALESCE(SUM(qty), 0),
		       COALESCE(SUM(value_mmk), 0)
		FROM (
			SELECT 'MAIN' AS location_code,
			       b.qty AS qty,
			       CAST(ROUND(
			         b.qty * COALESCE(i.buy_price_mmk, 0) * 1.0 /
			         CASE WHEN COALESCE(i.units_per_purchase, 1) < 1 THEN 1 ELSE i.units_per_purchase END
			       ) AS INTEGER) AS value_mmk
			FROM item_batches b
			JOIN items i ON i.id = b.item_id
			WHERE i.active = 1 AND b.qty > 0 AND b.location_code = 'MAIN'
			UNION ALL
			SELECT 'OT',
			       ob.qty,
			       CAST(ROUND(
			         ob.qty * COALESCE(i.buy_price_mmk, 0) * 1.0 /
			         CASE WHEN COALESCE(i.units_per_purchase, 1) < 1 THEN 1 ELSE i.units_per_purchase END
			       ) AS INTEGER)
			FROM ot_batches ob
			JOIN items i ON i.id = ob.item_id
			WHERE i.active = 1 AND ob.qty > 0
		) AS live
		GROUP BY location_code
		ORDER BY location_code
	`)
	if err != nil {
		return nil, 0, 0, err
	}
	defer rows.Close()
	out := make([]stockLocValue, 0)
	var totalQty, totalVal int64
	for rows.Next() {
		var row stockLocValue
		if err := rows.Scan(&row.LocationCode, &row.Qty, &row.ValueMMK); err != nil {
			return nil, 0, 0, err
		}
		out = append(out, row)
		totalQty += row.Qty
		totalVal += row.ValueMMK
	}
	return out, totalQty, totalVal, rows.Err()
}

func buildExpiryBuckets(db *sql.DB, asOf string) ([]expiryBucket, int64, int, error) {
	// Pull batches expiring within 90 days (includes already expired).
	list, err := listLiveNearExpiry(db, 90)
	if err != nil {
		return nil, 0, 0, err
	}
	// Need buy-per-box + tablets-per-box for value (buy is per L1).
	type itemCost struct {
		buyPerBox int64
		perBox    int64
	}
	costByItem := map[int64]itemCost{}
	priceRows, err := db.Query(`
		SELECT id, COALESCE(buy_price_mmk, 0),
		       CASE WHEN COALESCE(units_per_purchase, 1) < 1 THEN 1 ELSE units_per_purchase END
		FROM items WHERE active = 1`)
	if err != nil {
		return nil, 0, 0, err
	}
	defer priceRows.Close()
	for priceRows.Next() {
		var id int64
		var c itemCost
		if err := priceRows.Scan(&id, &c.buyPerBox, &c.perBox); err != nil {
			return nil, 0, 0, err
		}
		costByItem[id] = c
	}
	if err := priceRows.Err(); err != nil {
		return nil, 0, 0, err
	}

	type acc struct {
		batches int
		qty     int64
		value   int64
	}
	expired, d30, d60, d90 := acc{}, acc{}, acc{}, acc{}
	for _, row := range list {
		c := costByItem[row.ItemID]
		if c.perBox < 1 {
			c.perBox = 1
		}
		val := row.Qty * c.buyPerBox / c.perBox
		switch {
		case row.DaysLeft < 0:
			expired.batches++
			expired.qty += row.Qty
			expired.value += val
		case row.DaysLeft <= 30:
			d30.batches++
			d30.qty += row.Qty
			d30.value += val
		case row.DaysLeft <= 60:
			d60.batches++
			d60.qty += row.Qty
			d60.value += val
		default: // 61–90
			d90.batches++
			d90.qty += row.Qty
			d90.value += val
		}
	}
	buckets := []expiryBucket{
		{Key: "expired", Label: "Expired", Batches: expired.batches, Qty: expired.qty, ValueMMK: expired.value},
		{Key: "d30", Label: "<= 30 days", Batches: d30.batches, Qty: d30.qty, ValueMMK: d30.value},
		{Key: "d60", Label: "31-60 days", Batches: d60.batches, Qty: d60.qty, ValueMMK: d60.value},
		{Key: "d90", Label: "61-90 days", Batches: d90.batches, Qty: d90.qty, ValueMMK: d90.value},
	}
	valueAtRisk := expired.value + d30.value + d60.value + d90.value
	_ = asOf
	return buckets, valueAtRisk, len(list), nil
}

func listSlowMovers(db *sql.DB, slowDays int, asOf string) ([]slowMoverRow, error) {
	asOfT, _ := time.Parse("2006-01-02", asOf)
	cutoff := asOfT.AddDate(0, 0, -slowDays).Format("2006-01-02")
	rows, err := db.Query(`
		SELECT i.id, i.code, i.name,
		       COALESCE((
		         SELECT SUM(b.qty) FROM item_batches b
		         WHERE b.item_id = i.id AND b.location_code = 'MAIN' AND b.qty > 0
		       ), 0) + COALESCE((
		         SELECT SUM(ob.qty) FROM ot_batches ob
		         WHERE ob.item_id = i.id AND ob.qty > 0
		       ), 0) AS qty_on_hand,
		       COALESCE((
		         SELECT SUM(
		           CAST(ROUND(
		             b.qty * COALESCE(i.buy_price_mmk, 0) * 1.0 /
		             CASE WHEN COALESCE(i.units_per_purchase, 1) < 1 THEN 1 ELSE i.units_per_purchase END
		           ) AS INTEGER)
		         )
		         FROM item_batches b
		         WHERE b.item_id = i.id AND b.location_code = 'MAIN' AND b.qty > 0
		       ), 0) + COALESCE((
		         SELECT SUM(
		           CAST(ROUND(
		             ob.qty * COALESCE(i.buy_price_mmk, 0) * 1.0 /
		             CASE WHEN COALESCE(i.units_per_purchase, 1) < 1 THEN 1 ELSE i.units_per_purchase END
		           ) AS INTEGER)
		         )
		         FROM ot_batches ob
		         WHERE ob.item_id = i.id AND ob.qty > 0
		       ), 0) AS value_mmk,
		       (
		         SELECT MAX(d) FROM (
		           SELECT date(m.created_at) AS d
		           FROM stock_movements m
		           WHERE m.item_id = i.id AND m.movement_type IN ('SALE', 'ISSUE')
		           UNION ALL
		           SELECT date(m.created_at)
		           FROM ot_stock_movements m
		           WHERE m.item_id = i.id AND m.movement_type = 'SALE'
		         )
		       ) AS last_sale
		FROM items i
		WHERE i.active = 1
		  AND COALESCE((
		        SELECT SUM(b.qty) FROM item_batches b
		        WHERE b.item_id = i.id AND b.location_code = 'MAIN' AND b.qty > 0
		      ), 0) + COALESCE((
		        SELECT SUM(ob.qty) FROM ot_batches ob
		        WHERE ob.item_id = i.id AND ob.qty > 0
		      ), 0) > 0
		  AND NOT EXISTS (
		    SELECT 1 FROM stock_movements m
		    WHERE m.item_id = i.id
		      AND m.movement_type IN ('SALE', 'ISSUE')
		      AND date(m.created_at) >= date(?)
		  )
		  AND NOT EXISTS (
		    SELECT 1 FROM ot_stock_movements m
		    WHERE m.item_id = i.id
		      AND m.movement_type = 'SALE'
		      AND date(m.created_at) >= date(?)
		  )
		ORDER BY value_mmk DESC, i.code ASC
		LIMIT 50
	`, cutoff, cutoff)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]slowMoverRow, 0)
	for rows.Next() {
		var row slowMoverRow
		var last sql.NullString
		if err := rows.Scan(&row.ItemID, &row.Code, &row.Name, &row.QtyOnHand, &row.ValueMMK, &last); err != nil {
			return nil, err
		}
		if last.Valid && last.String != "" {
			row.LastSaleDate = last.String
			if saleT, e := time.Parse("2006-01-02", last.String); e == nil {
				d := int(asOfT.Sub(saleT).Hours() / 24)
				row.DaysSinceSale = &d
			}
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func parseDashRange(r *http.Request) (from, to string, days int, err error) {
	to = strings.TrimSpace(r.URL.Query().Get("to"))
	from = strings.TrimSpace(r.URL.Query().Get("from"))
	days = 30
	if v := strings.TrimSpace(r.URL.Query().Get("days")); v != "" {
		n, parseErr := strconv.Atoi(v)
		if parseErr != nil || (n != 7 && n != 30 && n != 90) {
			return "", "", 0, errBadDays
		}
		days = n
	}
	if to == "" {
		to = localToday()
	} else if _, e := time.Parse("2006-01-02", to); e != nil {
		return "", "", 0, errBadDate
	}
	if from == "" {
		toT, _ := time.Parse("2006-01-02", to)
		from = toT.AddDate(0, 0, -(days - 1)).Format("2006-01-02")
	} else if _, e := time.Parse("2006-01-02", from); e != nil {
		return "", "", 0, errBadDate
	}
	fromT, _ := time.Parse("2006-01-02", from)
	toT, _ := time.Parse("2006-01-02", to)
	if fromT.After(toT) {
		return "", "", 0, errBadRange
	}
	// Cap span at 366 days to keep aggregates cheap on LAN SQLite.
	if toT.Sub(fromT).Hours() > 24*366 {
		return "", "", 0, errRangeTooLong
	}
	spanDays := int(toT.Sub(fromT).Hours()/24) + 1
	return from, to, spanDays, nil
}

var (
	errBadDays      = &dashError{"days must be 7, 30, or 90"}
	errBadDate      = &dashError{"from/to must be YYYY-MM-DD"}
	errBadRange     = &dashError{"from must be on or before to"}
	errRangeTooLong = &dashError{"range too long (max 366 days)"}
)

type dashError struct{ msg string }

func (e *dashError) Error() string { return e.msg }

func countVoidsOnDate(db *sql.DB, date string) (int, error) {
	var opd, ot, pharmacy, lab int
	err := db.QueryRow(`
		SELECT COUNT(*) FROM opd_bills
		WHERE status = 'void' AND date(COALESCE(voided_at, updated_at, created_at)) = date(?)
	`, date).Scan(&opd)
	if err != nil {
		return 0, err
	}
	err = db.QueryRow(`
		SELECT COUNT(*) FROM ot_bills
		WHERE status = 'void' AND date(COALESCE(voided_at, updated_at, created_at)) = date(?)
	`, date).Scan(&ot)
	if err != nil {
		return 0, err
	}
	err = db.QueryRow(`
		SELECT COUNT(*) FROM pharmacy_bills
		WHERE status = 'void' AND date(COALESCE(voided_at, updated_at, created_at)) = date(?)
	`, date).Scan(&pharmacy)
	if err != nil {
		return 0, err
	}
	err = db.QueryRow(`
		SELECT COUNT(*) FROM lab_bills
		WHERE status = 'void' AND date(COALESCE(voided_at, updated_at, created_at)) = date(?)
	`, date).Scan(&lab)
	if err != nil {
		return 0, err
	}
	return opd + ot + pharmacy + lab, nil
}

func buildCashTrends(db *sql.DB, from, to string) ([]trendPoint, error) {
	fromT, err := time.Parse("2006-01-02", from)
	if err != nil {
		return nil, err
	}
	toT, err := time.Parse("2006-01-02", to)
	if err != nil {
		return nil, err
	}
	out := make([]trendPoint, 0)
	for d := fromT; !d.After(toT); d = d.AddDate(0, 0, 1) {
		key := d.Format("2006-01-02")
		move, err := buildCashMovement(db, key)
		if err != nil {
			return nil, err
		}
		cash := move.Desk
		out = append(out, trendPoint{
			Date:             key,
			OPDTotalMMK:      cash.OPDTotal,
			OTTotalMMK:       cash.OTTotal,
			PharmacyTotalMMK: cash.PharmacyTotal,
			LabTotalMMK:      cash.LabTotal,
			GrandTotalMMK:    cash.GrandTotal,
			BillCount:        cash.OPDCount + cash.OTCount + cash.PharmacyCount + cash.LabCount,
			IpdCashMMK:       move.IPD.NetMMK,
			IncomeMMK:        move.IncomeMMK,
			ExpenseMMK:       move.ExpenseMMK,
			NetCashMMK:       move.NetCashMMK,
		})
	}
	return out, nil
}

func buildRevenueByDoctor(db *sql.DB, from, to string) ([]doctorRevenueRow, error) {
	rows, err := db.Query(`
		SELECT doctor_id, doctor_name, SUM(bill_count), SUM(total_mmk)
		FROM (
			SELECT COALESCE(doctor_id, 0) AS doctor_id,
			       COALESCE(NULLIF(TRIM(doctor_name), ''), '(unassigned)') AS doctor_name,
			       COUNT(*) AS bill_count,
			       COALESCE(SUM(total_mmk), 0) AS total_mmk
			FROM opd_bills
			WHERE status = 'paid' AND collected_cash = 1 AND date(paid_at) BETWEEN date(?) AND date(?)
			GROUP BY COALESCE(doctor_id, 0), COALESCE(NULLIF(TRIM(doctor_name), ''), '(unassigned)')
			UNION ALL
			SELECT COALESCE(doctor_id, 0),
			       COALESCE(NULLIF(TRIM(doctor_name), ''), '(unassigned)'),
			       COUNT(*),
			       COALESCE(SUM(total_mmk), 0)
			FROM ot_bills
			WHERE status = 'paid' AND collected_cash = 1 AND date(paid_at) BETWEEN date(?) AND date(?)
			GROUP BY COALESCE(doctor_id, 0), COALESCE(NULLIF(TRIM(doctor_name), ''), '(unassigned)')
		)
		GROUP BY doctor_id, doctor_name
		ORDER BY SUM(total_mmk) DESC, doctor_name ASC
	`, from, to, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]doctorRevenueRow, 0)
	for rows.Next() {
		var row doctorRevenueRow
		if err := rows.Scan(&row.DoctorID, &row.DoctorName, &row.BillCount, &row.TotalMMK); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func buildRevenueByService(db *sql.DB, from, to string) ([]serviceRevenueRow, error) {
	rows, err := db.Query(`
		SELECT line_type, code, description, SUM(qty), SUM(total_mmk)
		FROM (
			SELECT bl.line_type,
			       COALESCE(bl.code, '') AS code,
			       COALESCE(bl.description, '') AS description,
			       COALESCE(bl.qty, 0) AS qty,
			       CASE WHEN bl.foc = 1 THEN 0 ELSE COALESCE(bl.line_total_mmk, 0) END AS total_mmk
			FROM bill_lines bl
			JOIN opd_bills b ON b.id = bl.bill_id
			WHERE b.status = 'paid' AND b.collected_cash = 1
			  AND bl.line_type IN ('service', 'consultation')
			  AND date(b.paid_at) BETWEEN date(?) AND date(?)
			UNION ALL
			SELECT bl.line_type,
			       COALESCE(bl.code, ''),
			       COALESCE(bl.description, ''),
			       COALESCE(bl.qty, 0),
			       CASE WHEN bl.foc = 1 THEN 0 ELSE COALESCE(bl.line_total_mmk, 0) END
			FROM ot_bill_lines bl
			JOIN ot_bills b ON b.id = bl.bill_id
			WHERE b.status = 'paid' AND b.collected_cash = 1
			  AND bl.line_type IN ('service', 'ot_fee')
			  AND date(b.paid_at) BETWEEN date(?) AND date(?)
		)
		GROUP BY line_type, code, description
		ORDER BY SUM(total_mmk) DESC, code ASC
	`, from, to, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]serviceRevenueRow, 0)
	for rows.Next() {
		var row serviceRevenueRow
		if err := rows.Scan(&row.LineType, &row.Code, &row.Description, &row.Qty, &row.TotalMMK); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func buildPharmacyMargin(db *sql.DB, from, to string) (*pharmacyMarginReport, error) {
	rows, err := db.Query(`
		SELECT item_id, code, name, SUM(qty_sold), SUM(revenue_mmk), SUM(cogs_mmk)
		FROM (
			SELECT COALESCE(bl.ref_id, 0) AS item_id,
			       COALESCE(NULLIF(TRIM(bl.code), ''), COALESCE(i.code, '')) AS code,
			       COALESCE(NULLIF(TRIM(bl.description), ''), COALESCE(i.name, '(item)')) AS name,
			       COALESCE(bl.qty, 0) AS qty_sold,
			       CASE WHEN bl.foc = 1 THEN 0 ELSE COALESCE(bl.line_total_mmk, 0) END AS revenue_mmk,
			       CAST(ROUND(
			         COALESCE(bl.qty, 0) * COALESCE(i.buy_price_mmk, 0) * 1.0 /
			         CASE WHEN COALESCE(i.units_per_purchase, 1) < 1 THEN 1 ELSE i.units_per_purchase END
			       ) AS INTEGER) AS cogs_mmk
			FROM bill_lines bl
			JOIN opd_bills b ON b.id = bl.bill_id
			LEFT JOIN items i ON i.id = bl.ref_id
			WHERE b.status = 'paid' AND b.collected_cash = 1
			  AND bl.line_type = 'item'
			  AND date(b.paid_at) BETWEEN date(?) AND date(?)
			UNION ALL
			SELECT COALESCE(bl.ref_id, 0),
			       COALESCE(NULLIF(TRIM(bl.code), ''), COALESCE(i.code, '')),
			       COALESCE(NULLIF(TRIM(bl.description), ''), COALESCE(i.name, '(item)')),
			       COALESCE(bl.qty, 0),
			       CASE WHEN bl.foc = 1 THEN 0 ELSE COALESCE(bl.line_total_mmk, 0) END,
			       CAST(ROUND(
			         COALESCE(bl.qty, 0) * COALESCE(i.buy_price_mmk, 0) * 1.0 /
			         CASE WHEN COALESCE(i.units_per_purchase, 1) < 1 THEN 1 ELSE i.units_per_purchase END
			       ) AS INTEGER)
			FROM ot_bill_lines bl
			JOIN ot_bills b ON b.id = bl.bill_id
			LEFT JOIN items i ON i.id = bl.ref_id
			WHERE b.status = 'paid' AND b.collected_cash = 1
			  AND bl.line_type = 'item'
			  AND date(b.paid_at) BETWEEN date(?) AND date(?)
			UNION ALL
			SELECT COALESCE(bl.item_id, 0),
			       COALESCE(NULLIF(TRIM(bl.code), ''), COALESCE(i.code, '')),
			       COALESCE(NULLIF(TRIM(bl.description), ''), COALESCE(i.name, '(item)')),
			       CASE WHEN b.bill_no LIKE 'RT-%' THEN -COALESCE(bl.stock_qty, 0) ELSE COALESCE(bl.stock_qty, 0) END,
			       CASE
			         WHEN bl.foc = 1 THEN 0
			         WHEN b.bill_no LIKE 'RT-%' THEN -COALESCE(bl.line_total_mmk, 0)
			         ELSE COALESCE(bl.line_total_mmk, 0)
			       END,
			       CAST(ROUND(
			         (CASE WHEN b.bill_no LIKE 'RT-%' THEN -COALESCE(bl.stock_qty, 0) ELSE COALESCE(bl.stock_qty, 0) END)
			         * COALESCE(i.buy_price_mmk, 0) * 1.0 /
			         CASE WHEN COALESCE(i.units_per_purchase, 1) < 1 THEN 1 ELSE i.units_per_purchase END
			       ) AS INTEGER)
			FROM pharmacy_bill_lines bl
			JOIN pharmacy_bills b ON b.id = bl.bill_id
			LEFT JOIN items i ON i.id = bl.item_id
			WHERE b.status = 'paid' AND b.collected_cash = 1
			  AND b.bill_no NOT LIKE 'TO-%'
			  AND date(b.paid_at) BETWEEN date(?) AND date(?)
		)
		GROUP BY item_id, code, name
		ORDER BY SUM(revenue_mmk) DESC
	`, from, to, from, to, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]pharmacyItemMargin, 0)
	var revTotal, cogsTotal int64
	for rows.Next() {
		var row pharmacyItemMargin
		if err := rows.Scan(&row.ItemID, &row.Code, &row.Name, &row.QtySold, &row.RevenueMMK, &row.COGSMMK); err != nil {
			return nil, err
		}
		row.MarginMMK = row.RevenueMMK - row.COGSMMK
		items = append(items, row)
		revTotal += row.RevenueMMK
		cogsTotal += row.COGSMMK
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	marginTotal := revTotal - cogsTotal
	var cogsPct, marginPct float64
	if revTotal > 0 {
		cogsPct = float64(cogsTotal) * 100 / float64(revTotal)
		marginPct = float64(marginTotal) * 100 / float64(revTotal)
	}

	byRev := make([]pharmacyItemMargin, len(items))
	copy(byRev, items)
	if len(byRev) > 15 {
		byRev = byRev[:15]
	}

	byMargin := make([]pharmacyItemMargin, len(items))
	copy(byMargin, items)
	// Sort by margin descending (simple insertion for small N).
	for i := 1; i < len(byMargin); i++ {
		j := i
		for j > 0 && byMargin[j].MarginMMK > byMargin[j-1].MarginMMK {
			byMargin[j], byMargin[j-1] = byMargin[j-1], byMargin[j]
			j--
		}
	}
	if len(byMargin) > 15 {
		byMargin = byMargin[:15]
	}

	return &pharmacyMarginReport{
		From:         from,
		To:           to,
		Note:         "Estimated pharmacy gross margin from current item buy prices (buy cost is not snapshotted on bill lines).",
		RevenueMMK:   revTotal,
		COGSMMK:      cogsTotal,
		MarginMMK:    marginTotal,
		COGSPct:      cogsPct,
		MarginPct:    marginPct,
		TopByRevenue: byRev,
		TopByMargin:  byMargin,
	}, nil
}
