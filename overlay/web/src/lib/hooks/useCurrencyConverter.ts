import { useQueries } from "@tanstack/react-query";
import { marketApi } from "@/lib/api/market";
import { normalizeCurrency, type ConvertMoney } from "@/lib/currencyConversion";

export function useCurrencyConverter(targetCurrency: string, sourceCurrencies: readonly string[]) {
  const target = normalizeCurrency(targetCurrency);
  const sources = [...new Set(sourceCurrencies.map((c) => normalizeCurrency(c)))].filter(
    (source) => source !== target,
  );

  const queries = useQueries({
    queries: sources.map((source) => ({
      queryKey: ["fx-rate", source, target],
      queryFn: () => marketApi.fx({ from: source, to: target }),
      staleTime: 15 * 60_000,
      gcTime: 60 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    })),
  });

  const rates = new Map<string, number>();
  sources.forEach((source, index) => {
    const rate = queries[index]?.data?.rate;
    if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) {
      rates.set(source, rate);
    }
  });

  const convert: ConvertMoney = (amount, fromCurrency) => {
    const from = normalizeCurrency(fromCurrency, target);
    if (from === target) return amount;
    const rate = rates.get(from);
    return rate == null ? amount : amount * rate;
  };

  const missingRates = sources.filter((source) => !rates.has(source));
  return {
    targetCurrency: target,
    convert,
    rates,
    missingRates,
    isLoading: queries.some((q) => q.isLoading),
    isError: queries.some((q) => q.isError),
    ready: missingRates.length === 0,
  };
}
