const MONTH_ABBR = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

const MONTH_FULL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function monthAbbr(month: number): string {
  return MONTH_ABBR[month - 1] ?? String(month);
}

export function monthFull(month: number): string {
  return MONTH_FULL[month - 1] ?? String(month);
}

export function monthLabel(year: number, month: number): string {
  return `${monthAbbr(month)}/${String(year).slice(2)}`;
}
