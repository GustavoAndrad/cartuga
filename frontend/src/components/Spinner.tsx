interface SpinnerProps {
  label?: string;
}

export function Spinner({ label = "Carregando..." }: SpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-cartuga-600 dark:text-cartuga-300">
      <span className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-300 border-t-cartuga-600 dark:border-neutral-700 dark:border-t-cartuga-300" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
