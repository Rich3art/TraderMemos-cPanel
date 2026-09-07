import { describe, expect, it } from "vite-plus/test";
import type { Trade } from "./api/types";
import { convertTradeMoney, summarizeTradesForDisplay } from "./currencyConversion";

const trade = (partial: Partial<Trade>): Trade => ({
  id: partial.id ?? "t1",
  account_id: partial.account_id ?? "a1",
  symbol: partial.symbol ?? "XAUUSD",
  instrument_type: partial.instrument_type ?? "forex",
  direction: partial.direction ?? "long",
  status: partial.status ?? "closed",
  opened_at: partial.opened_at ?? "2026-09-01T10:00:00Z",
  closed_at: partial.closed_at ?? "2026-09-01T11:00:00Z",
  qty_opened: partial.qty_opened ?? 0.01,
  qty_remaining: partial.qty_remaining ?? 0,
  avg_entry_price: partial.avg_entry_price ?? 4665.92,
  avg_exit_price: partial.avg_exit_price ?? 4671.28,
  gross_pnl: partial.gross_pnl ?? partial.net_pnl ?? 0,
  fees_total: partial.fees_total ?? 0,
  net_pnl: partial.net_pnl ?? 0,
  pnl_currency: partial.pnl_currency ?? "USD",
  return_pct: partial.return_pct ?? 0,
  time_in_trade_secs: partial.time_in_trade_secs ?? 3600,
  notes: partial.notes ?? "",
  tags: partial.tags ?? [],
  initial_risk: partial.initial_risk ?? null,
});

describe("currency conversion helpers", () => {
  it("converts each trade from its own pnl currency before summing", () => {
    const convert = (amount: number, from?: string | null) => (from === "USD" ? amount * 18 : amount);
    const trades = [
      convertTradeMoney(trade({ id: "zar-loss", pnl_currency: "ZAR", net_pnl: -1108.9 }), "ZAR", convert),
      convertTradeMoney(trade({ id: "usd-loss", pnl_currency: "USD", net_pnl: -75.05 }), "ZAR", convert),
    ];

    expect(trades[0].net_pnl).toBe(-1108.9);
    expect(trades[1].net_pnl).toBeCloseTo(-1350.9);
    expect(summarizeTradesForDisplay(trades)?.net_pnl).toBeCloseTo(-2459.8);
  });
});
