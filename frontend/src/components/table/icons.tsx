interface IconProps {
  className?: string;
}

const DEFAULT_CLASS = "h-4 w-4";

export function PencilIcon({ className = DEFAULT_CLASS }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M4 16.5V20h3.5L17.8 9.7l-3.5-3.5L4 16.5ZM20.7 6.8a1 1 0 0 0 0-1.4l-2.1-2.1a1 1 0 0 0-1.4 0l-1.6 1.6 3.5 3.5 1.6-1.6Z" />
    </svg>
  );
}

export function TrashIcon({ className = DEFAULT_CLASS }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Zm4 2v8h1v-8h-1Zm3 0v8h1v-8h-1Z" />
    </svg>
  );
}

export function SearchIcon({ className = DEFAULT_CLASS }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M10.5 3a7.5 7.5 0 0 1 5.9 12.1l4.75 4.75-1.4 1.4-4.75-4.75A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z" />
    </svg>
  );
}

export function SortNeutralIcon({ className = DEFAULT_CLASS }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 4l3 4H9l3-4Zm0 16-3-4h6l-3 4Z" />
    </svg>
  );
}

export function SortAscIcon({ className = DEFAULT_CLASS }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 5l5 6H7l5-6Z" />
    </svg>
  );
}

export function SortDescIcon({ className = DEFAULT_CLASS }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 19l-5-6h10l-5 6Z" />
    </svg>
  );
}

export function ChevronLeftIcon({ className = DEFAULT_CLASS }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M15 4l-8 8 8 8 1.4-1.4L9.8 12l6.6-6.6L15 4Z" />
    </svg>
  );
}

export function ChevronRightIcon({ className = DEFAULT_CLASS }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M9 4l8 8-8 8-1.4-1.4L14.2 12 7.6 5.4 9 4Z" />
    </svg>
  );
}

export function TagIcon({ className = DEFAULT_CLASS }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M21 12.5 12.5 21a1.5 1.5 0 0 1-2.12 0l-7.38-7.38a1.5 1.5 0 0 1 0-2.12L11.5 3H20a1 1 0 0 1 1 1v8.5ZM7 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
    </svg>
  );
}

export function CalendarIcon({ className = DEFAULT_CLASS }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7Zm12 8H5v10h14V10Z" />
    </svg>
  );
}

export function LayersIcon({ className = DEFAULT_CLASS }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2 2 8l10 6 10-6-10-6Zm0 8.5L4.5 8 12 5l7.5 3-7.5 2.5ZM2 13l10 6 10-6-1.8-1.08L12 17.36 3.8 11.92 2 13Z" />
    </svg>
  );
}

export function CreditCardIcon({ className = DEFAULT_CLASS }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" clipRule="evenodd" d="M2 5h20v14H2V5Zm1.5 1.5v11h17v-11h-17Z" />
      <rect x="3.5" y="9" width="17" height="2.5" />
    </svg>
  );
}

export function XIcon({ className = DEFAULT_CLASS }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6 6.4 5Z" />
    </svg>
  );
}

export function ArrowUpIcon({ className = DEFAULT_CLASS }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 5l6 7h-4v7h-4v-7H6l6-7Z" />
    </svg>
  );
}

export function ArrowDownIcon({ className = DEFAULT_CLASS }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 19l-6-7h4V5h4v7h4l-6 7Z" />
    </svg>
  );
}

export function ExpandIcon({ className = DEFAULT_CLASS }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M3 3h7v2H5v5H3V3Zm18 0v7h-2V5h-5V3h7ZM3 14h2v5h5v2H3v-7Zm18 0v7h-7v-2h5v-5h2Z" />
    </svg>
  );
}

export function CurrencyExchangeIcon({ className = DEFAULT_CLASS }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <rect x="3" y="6.25" width="14" height="1.5" />
      <path d="M17 3 17 11 22 7Z" />
      <rect x="7" y="16.25" width="14" height="1.5" />
      <path d="M7 13 7 21 2 17Z" />
    </svg>
  );
}

export function VaultIcon({ className = DEFAULT_CLASS }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" clipRule="evenodd" d="M4 3h16v18H4V3Zm1.5 1.5v15h13v-15h-13Z" />
      <circle cx="12" cy="12" r="3.5" />
      <rect x="11.3" y="8.3" width="1.4" height="2" />
      <rect x="6" y="5.5" width="2" height="1.4" />
      <rect x="16" y="5.5" width="2" height="1.4" />
    </svg>
  );
}

export function ImpactIcon({ className = DEFAULT_CLASS }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <rect x="4" y="14" width="3.5" height="7" />
      <rect x="10.25" y="9" width="3.5" height="12" />
      <rect x="16.5" y="4" width="3.5" height="17" />
    </svg>
  );
}

export function CheckIcon({ className = DEFAULT_CLASS }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 20.6 7.4 19.2 6 9 16.2Z" />
    </svg>
  );
}

export function ClockIcon({ className = DEFAULT_CLASS }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Z" />
      <path d="M11 7h2v5.4l4 2.3-1 1.7-5-2.9V7Z" />
    </svg>
  );
}

export function ExternalLinkIcon({ className = DEFAULT_CLASS }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M14 3h7v7h-2V6.4l-8.3 8.3-1.4-1.4L17.6 5H14V3Z" />
      <path d="M5 5h6v2H7v10h10v-4h2v6H5V5Z" />
    </svg>
  );
}

export function ResetViewIcon({ className = DEFAULT_CLASS }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 5a7 7 0 1 1-6.93 8h2.02A5 5 0 1 0 12 7v3L7.5 6 12 2v3Z" />
    </svg>
  );
}

export function InfoCircleIcon({ className = DEFAULT_CLASS }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm-1 7h2v6h-2v-6Zm0-4h2v2h-2V7Z" />
    </svg>
  );
}

export function DownloadIcon({ className = DEFAULT_CLASS }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M11 3h2v9.6l3.3-3.3 1.4 1.4L12 16.4l-5.7-5.7 1.4-1.4 3.3 3.3V3ZM4 15h2v4h12v-4h2v6H4v-6Z" />
    </svg>
  );
}
