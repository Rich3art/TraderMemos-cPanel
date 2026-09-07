import type { CashTransaction, Summary, Trade, TradeDetail } from "./api/types";

export type ConvertMoney = (amount: number, fromCurrency?: string | null) => number;

export function normalizeCurrency(code: string | null | undefined, fallback = "USD"): string {
  const raw = String(code ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(raw) ? raw : fallback;
}

export function tradeCurrencies(trades: readonly Pick<Trade, "pnl_currency">[]): string[] {
  return [...new Set(trades.map((t) => normalizeCurrency(t.pnl_currency)))];
}

export function cashCurrencies(cashTx: readonly Pick<CashTransaction, "currency">[]): string[] {
  return [...new Set(cashTx.map((c) => normalizeCurrency(c.currency)))];
}

export function convertTradeMoney<T extends Trade>(
  trade: T,
  targetCurrency: string,
  convert: ConvertMoney,
): T {
  const from = normalizeCurrency(trade.pnl_currency, targetCurrency);
  const money = (value: number | null | undefined) =>
    value == null ? value : Math.round(convert(value, from) * 100) / 100;
  return {
    ...trade,
    gross_pnl: money(trade.gross_pnl) ?? null,
    fees_total: money(trade.fees_total) ?? 0,
    net_pnl: money(trade.net_pnl) ?? null,
    initial_risk: money(trade.initial_risk) ?? null,
    pnl_currency: targetCurrency,
  };
}

export function convertTradeDetailMoney<T extends TradeDetail>(
  trade: T,
  targetCurrency: string,
  convert: ConvertMoney,
): T {
  const converted = convertTradeMoney(trade, targetCurrency, convert);
  const from = normalizeCurrency(trade.pnl_currency, targetCurrency);
  const money = (value: number | null | undefined) =>
    value == null ? value : Math.round(convert(value, from) * 100) / 100;
  return {
    ...converted,
    dividend_total: money(trade.dividend_total) ?? 0,
    total_pnl: money(trade.total_pnl) ?? null,
    fills: trade.fills.map((fill) => ({
      ...fill,
      fees: money(fill.fees) ?? 0,
      commission: money(fill.commission) ?? 0,
    })),
  };
}

export function convertCashMoney<T extends CashTransaction>(
  tx: T,
  targetCurrency: string,
  convert: ConvertMoney,
): T {
  const from = normalizeCurrency(tx.currency, targetCurrency);
  return {
    ...tx,
    amount: Math.round(convert(tx.amount, from) * 100) / 100,
    currency: targetCurrency,
  };
}

export function summarizeTradesForDisplay(
  trades: readonly Trade[],
  fallback?: Summary,
): Summary | undefined {
  if (!fallback && trades.length === 0) return undefined;
  const closed = trades.filter((t) => t.status !== "open" && t.net_pnl != null);
  const pnls = closed.map((t) => t.net_pnl ?? 0);
  const wins = pnls.filter((p) => p > 0);
  const losses = pnls.filter((p) => p < 0);
  const breakeven = pnls.filter((p) => p === 0).length;
  const grossProfit = wins.reduce((sum, p) => sum + p, 0);
  const grossLoss = losses.reduce((sum, p) => sum + Math.abs(p), 0);
  const totalFees = closed.reduce((sum, t) => sum + (t.fees_total ?? 0), 0);
  const netPnl = pnls.reduce((sum, p) => sum + p, 0);
  const avg = (values: number[]) =>
    values.length ? values.reduce((sum, p) => sum + p, 0) / values.length : 0;
  return {
    total_trades: closed.length,
    wins: wins.length,
    losses: losses.length,
    breakeven,
    win_rate: closed.length ? wins.length / closed.length : 0,
    net_pnl: round2(netPnl),
    gross_pnl: round2(netPnl + totalFees),
    gross_profit: round2(grossProfit),
    gross_loss: round2(grossLoss),
    profit_factor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? grossProfit : 0,
    expectancy: closed.length ? round2(netPnl / closed.length) : 0,
    avg_win: round2(avg(wins)),
    avg_loss: round2(avg(losses.map(Math.abs))),
    avg_trade: closed.length ? round2(netPnl / closed.length) : 0,
    largest_win: round2(wins.length ? Math.max(...wins) : 0),
    largest_loss: round2(losses.length ? Math.max(...losses.map(Math.abs)) : 0),
    total_fees: round2(totalFees),
    median_win: fallback?.median_win,
    median_loss: fallback?.median_loss,
    median_trade: fallback?.median_trade,
    kelly_pct: fallback?.kelly_pct,
    sqn: fallback?.sqn,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
