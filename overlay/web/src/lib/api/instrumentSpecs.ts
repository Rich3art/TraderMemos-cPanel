import { apiFetch, qs } from "./client";

export interface InstrumentSpec {
  id: string;
  symbol_root: string;
  instrument_type: string;
  tick_size: number;
  tick_value: number;
  multiplier: number;
  currency: string;
}

export const instrumentSpecsApi = {
  get: (params: { symbol: string; instrument_type: string }) =>
    apiFetch<InstrumentSpec>(
      `/market/instrument-spec${qs(params as Record<string, string | undefined>)}`,
    ),
};
