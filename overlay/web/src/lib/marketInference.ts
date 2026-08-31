import { CUSTOM_PRESET_ID, FUTURES_PRESETS, multiplierForPreset, presetIdForSymbol } from "./futuresPresets";
import { inferOptionRightFromSymbol } from "./tradeDirection";

export type InferredMarket = "stock" | "option" | "crypto" | "future" | "forex";

export interface MarketDefaults {
  market: InferredMarket;
  futuresPresetId: string;
  multiplier: string;
  option_right: "" | "call" | "put";
  option_strike: string;
  option_expiry: string;
}

const FIAT_CODES = new Set([
  "AUD",
  "CAD",
  "CHF",
  "CNH",
  "EUR",
  "GBP",
  "HKD",
  "JPY",
  "MXN",
  "NOK",
  "NZD",
  "SEK",
  "SGD",
  "USD",
  "ZAR",
]);

const CRYPTO_QUOTES = new Set(["BTC", "ETH", "EUR", "GBP", "USD", "USDC", "USDT"]);
const CRYPTO_BASES = new Set([
  "ADA",
  "AVAX",
  "BNB",
  "BTC",
  "DOGE",
  "DOT",
  "ETH",
  "LINK",
  "LTC",
  "MATIC",
  "SOL",
  "TRX",
  "XLM",
  "XRP",
]);

const METAL_FOREX = new Set(["XAUUSD", "XAGUSD", "XPTUSD", "XPDUSD"]);
const FUTURES_ROOTS = new Set([
  ...FUTURES_PRESETS.map((preset) => preset.symbol),
  "MES",
  "MNQ",
  "M2K",
  "MYM",
  "MGC",
  "SIL",
  "SI",
  "HG",
  "NG",
  "RB",
  "HO",
  "ZB",
  "ZN",
  "ZF",
  "ZT",
  "6E",
  "6B",
  "6J",
  "6A",
  "6C",
  "6S",
  "ZC",
  "ZS",
  "ZW",
]);

const FUTURES_MONTH_CODES = "[FGHJKMNQUVXZ]";

export const MARKET_LABELS: Record<InferredMarket, string> = {
  stock: "STOCK",
  option: "OPTION",
  crypto: "CRYPTO",
  future: "FUTURES",
  forex: "FOREX",
};

function cleanSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/\s+/g, "");
}

function splitPair(symbol: string): [string, string] | null {
  const normalized = symbol.trim().toUpperCase();
  const delimited = normalized.match(/^([A-Z0-9]{2,10})[/:_-]([A-Z0-9]{2,10})$/);
  if (delimited) return [delimited[1]!, delimited[2]!];
  const compact = cleanSymbol(symbol);
  for (const quote of [...CRYPTO_QUOTES].sort((a, b) => b.length - a.length)) {
    if (compact.endsWith(quote) && compact.length > quote.length) {
      return [compact.slice(0, -quote.length), quote];
    }
  }
  return null;
}

function isForexSymbol(symbol: string): boolean {
  const compact = cleanSymbol(symbol);
  if (METAL_FOREX.has(compact)) return true;
  const pair = splitPair(symbol);
  if (!pair) return false;
  return FIAT_CODES.has(pair[0]) && FIAT_CODES.has(pair[1]);
}

function isCryptoSymbol(symbol: string): boolean {
  const pair = splitPair(symbol);
  if (!pair) return false;
  const [base, quote] = pair;
  return CRYPTO_BASES.has(base) && CRYPTO_QUOTES.has(quote) && !FIAT_CODES.has(base);
}

function futuresRoot(symbol: string): string {
  const compact = cleanSymbol(symbol).replace(/^\/+/, "");
  const contract = compact.match(new RegExp(`^([A-Z0-9]{1,4})${FUTURES_MONTH_CODES}\\d{1,2}$`));
  return contract?.[1] ?? compact;
}

function isFuturesSymbol(symbol: string): boolean {
  const root = futuresRoot(symbol);
  return FUTURES_ROOTS.has(root) || presetIdForSymbol(root) !== CUSTOM_PRESET_ID;
}

export function inferMarketFromSymbol(symbol: string): InferredMarket {
  if (!symbol.trim()) return "stock";
  if (inferOptionRightFromSymbol(symbol)) return "option";
  if (isFuturesSymbol(symbol)) return "future";
  if (isForexSymbol(symbol)) return "forex";
  if (isCryptoSymbol(symbol)) return "crypto";
  return "stock";
}

export function marketDefaultsForSymbol(symbol: string): MarketDefaults {
  const market = inferMarketFromSymbol(symbol);
  const futureRoot = futuresRoot(symbol);
  const futuresPresetId = market === "future" ? presetIdForSymbol(futureRoot) : CUSTOM_PRESET_ID;
  return {
    market,
    futuresPresetId,
    multiplier:
      market === "option"
        ? "100"
        : market === "future"
          ? String(multiplierForPreset(futuresPresetId))
          : "1",
    option_right: market === "option" ? inferOptionRightFromSymbol(symbol) || "call" : "",
    option_strike: "",
    option_expiry: "",
  };
}
