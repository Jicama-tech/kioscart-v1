// hooks/useCurrency.ts
import { useMemo } from "react";

interface CurrencyConfig {
  symbol: string;
  code: string;
  locale: string;
  spokenName: string;
}

const CURRENCY_CONFIG: Record<string, CurrencyConfig> = {
  IN: { symbol: "₹", code: "INR", locale: "en-IN", spokenName: "rupees" },
  SG: { symbol: "S$", code: "SGD", locale: "en-SG", spokenName: "Singapore dollars" },
};

export const useCurrency = (country: string) => {
  const config = useMemo(
    () => CURRENCY_CONFIG[country] || CURRENCY_CONFIG["IN"],
    [country]
  );

  const formatPrice = (amount: number): string => {
    return new Intl.NumberFormat(config.locale, {
      style: "currency",
      currency: config.code,
    }).format(amount);
  };

  const getSymbol = (): string => config.symbol;

  return { formatPrice, getSymbol, config };
};
