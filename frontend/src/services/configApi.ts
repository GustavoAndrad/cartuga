import { apiClient } from "./api";
import type { Currency } from "../types";

export interface ExchangeRates {
  base: string;
  rates: Record<Currency, number>;
}

export interface ExchangeRateHistoryPoint {
  date: string;
  USD: number;
  EUR: number;
}

export interface ExchangeRateHistory {
  base: string;
  points: ExchangeRateHistoryPoint[];
}

export async function getExchangeRates(): Promise<ExchangeRates> {
  const { data } = await apiClient.get<ExchangeRates>("/config/exchange-rates");
  return data;
}

export async function getExchangeRateHistory(days = 30): Promise<ExchangeRateHistory> {
  const { data } = await apiClient.get<ExchangeRateHistory>("/config/exchange-rates/history", {
    params: { days },
  });
  return data;
}

export interface ExchangeRateForDate {
  base: string;
  /** The rate's actual date - the closest prior business day, if `date` had none published. */
  date: string;
  rates: Record<Currency, number>;
}

/** BRL rates as of a specific past date (PTAX closing) - for showing what a stored
 * amount was actually worth in another currency back then, never today's rate. */
export async function getExchangeRateForDate(date: string): Promise<ExchangeRateForDate> {
  const { data } = await apiClient.get<ExchangeRateForDate>(`/config/exchange-rates/date/${date}`);
  return data;
}
