import { useCurrency } from "../hooks/useCurrency";

interface CurrencyAmountProps {
  amount: string | number;
  className?: string;
  colorize?: boolean;
}

export function CurrencyAmount({ amount, className = "", colorize = false }: CurrencyAmountProps) {
  const { format } = useCurrency();
  const numeric = typeof amount === "string" ? parseFloat(amount) : amount;

  const colorClass = colorize
    ? numeric < 0
      ? "text-red-600 dark:text-red-400"
      : "text-cartuga-700 dark:text-cartuga-200"
    : "";

  return <span className={`${colorClass} ${className}`}>{format(amount)}</span>;
}
