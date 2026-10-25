package handlers

import "testing"

func TestApplyBillDiscount(t *testing.T) {
	cases := []struct {
		name     string
		gross    int64
		value    int64
		unit     string
		wantOff  int64
		wantNet  int64
		wantUnit string
		wantErr  string
	}{
		{name: "blank", gross: 10000, value: 0, unit: "", wantOff: 0, wantNet: 10000, wantUnit: "percent"},
		{name: "ten percent", gross: 10000, value: 10, unit: "percent", wantOff: 1000, wantNet: 9000, wantUnit: "percent"},
		{name: "half up", gross: 1005, value: 10, unit: "percent", wantOff: 101, wantNet: 904, wantUnit: "percent"},
		{name: "full percent", gross: 10000, value: 100, unit: "percent", wantOff: 10000, wantNet: 0, wantUnit: "percent"},
		{name: "mmk", gross: 10000, value: 2500, unit: "mmk", wantOff: 2500, wantNet: 7500, wantUnit: "mmk"},
		{name: "mmk all", gross: 10000, value: 10000, unit: "MMK", wantOff: 10000, wantNet: 0, wantUnit: "mmk"},
		{name: "percent too high", gross: 10000, value: 101, unit: "percent", wantErr: "discount percent must be 0-100"},
		{name: "mmk too high", gross: 10000, value: 10001, unit: "mmk", wantErr: "discount exceeds total"},
		{name: "bad unit", gross: 10000, value: 1, unit: "kyat", wantErr: "discount_unit must be percent or mmk"},
		{name: "negative", gross: 10000, value: -1, unit: "mmk", wantErr: "discount_value must be >= 0"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			off, net, unit, errMsg := applyBillDiscount(tc.gross, tc.value, tc.unit)
			if errMsg != tc.wantErr {
				t.Fatalf("err %q, want %q", errMsg, tc.wantErr)
			}
			if tc.wantErr != "" {
				return
			}
			if off != tc.wantOff || net != tc.wantNet || unit != tc.wantUnit {
				t.Fatalf("got off %d net %d unit %s, want %d %d %s", off, net, unit, tc.wantOff, tc.wantNet, tc.wantUnit)
			}
		})
	}
}
