/** Small icons used only by the Assistente UI - same 24px filled style as table/icons. */
interface IconProps {
  className?: string;
}

const base = (className = "h-4 w-4") => ({ viewBox: "0 0 24 24", fill: "currentColor", className, "aria-hidden": true });

export function SendIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M3.4 20.4 21 12 3.4 3.6l-.01 6.53L15 12 3.39 13.87 3.4 20.4Z" />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z" />
    </svg>
  );
}

export function ExpandIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4 4h7v2H6v5H4V4Zm9 0h7v7h-2V6h-5V4ZM4 13h2v5h5v2H4v-7Zm14 0h2v7h-7v-2h5v-5Z" />
    </svg>
  );
}

export function CollapseIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M9 4v5H4v2h7V4H9Zm6 0h-2v7h7V9h-5V4ZM4 13v2h5v5h2v-7H4Zm9 0v7h2v-5h5v-2h-7Z" />
    </svg>
  );
}

export function OpenPageIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M14 3h7v7h-2V6.4l-8.3 8.3-1.4-1.4L17.6 5H14V3ZM5 5h6v2H5v12h12v-6h2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
    </svg>
  );
}

export function DatabaseIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 3c4.4 0 8 1.3 8 3v12c0 1.7-3.6 3-8 3s-8-1.3-8-3V6c0-1.7 3.6-3 8-3Zm6 11.2c-1.5.7-3.7 1.1-6 1.1s-4.5-.4-6-1.1V18c.3.4 2.4 1.2 6 1.2s5.7-.8 6-1.2v-3.8Zm0-6c-1.5.7-3.7 1.1-6 1.1s-4.5-.4-6-1.1V12c.3.4 2.4 1.2 6 1.2s5.7-.8 6-1.2V8.2ZM12 5c-3.6 0-5.7.8-6 1.2.3.4 2.4 1.2 6 1.2s5.7-.8 6-1.2C17.7 5.8 15.6 5 12 5Z" />
    </svg>
  );
}

export function StepsIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M5 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm0 7a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm0 7a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM9 4h12v2H9V4Zm0 7h12v2H9v-2Zm0 7h12v2H9v-2Z" />
    </svg>
  );
}

export function CopyIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M8 3h11a2 2 0 0 1 2 2v11h-2V5H8V3ZM5 7h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Zm0 2v10h10V9H5Z" />
    </svg>
  );
}

export function CheckSmallIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 20.6 7.4 19.2 6 9 16.2Z" />
    </svg>
  );
}

export function WarningIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 2 1 21h22L12 2Zm0 4.2L19.5 19h-15L12 6.2ZM11 10v5h2v-5h-2Zm0 6v2h2v-2h-2Z" />
    </svg>
  );
}

export function ShieldIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 2 4 5v6c0 5 3.4 9.6 8 11 4.6-1.4 8-6 8-11V5l-8-3Zm0 2.2 6 2.2V11c0 3.9-2.5 7.6-6 8.9-3.5-1.3-6-5-6-8.9V6.4l6-2.2ZM11 7h2v6h-2V7Zm0 8h2v2h-2v-2Z" />
    </svg>
  );
}

export function LockIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Zm-3 2h12v8H6v-8Z" />
    </svg>
  );
}

export function ChatBubbleIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 2v10h2v1.8L8.3 16H20V6H4Z" />
    </svg>
  );
}

export function ChartIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M3 3h2v16h16v2H3V3Zm4 9h3v5H7v-5Zm5-5h3v10h-3V7Zm5 3h3v7h-3v-7Z" />
    </svg>
  );
}

export function BookIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3Zm0 2a1 1 0 0 0-1 1v11.2c.3-.1.7-.2 1-.2h12V4H6Zm0 14a1 1 0 0 0 0 2h12v-2H6Zm2-12h8v2H8V6Z" />
    </svg>
  );
}

export function CoinIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm1 2v1.1c1.6.3 2.8 1.4 3 2.9h-2c-.2-.7-.9-1.2-2-1.2-1.2 0-2 .5-2 1.2 0 .6.5 1 2.2 1.3 2.4.5 3.8 1.3 3.8 3.2 0 1.6-1.2 2.7-3 3V18h-2v-1.1c-1.7-.3-3-1.5-3.1-3.1h2c.2.8 1 1.3 2.1 1.3 1.3 0 2-.5 2-1.2 0-.6-.5-1-2.3-1.4-2.3-.5-3.7-1.3-3.7-3.1 0-1.5 1.2-2.6 3-2.9V6h2Z" />
    </svg>
  );
}

export function ServerIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4 3h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm1 2v4h14V5H5Zm-1 8h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1Zm1 2v4h14v-4H5Zm2-9h2v2H7V6Zm0 10h2v2H7v-2Z" />
    </svg>
  );
}

export function BoltIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
    </svg>
  );
}

export function CpuIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M9 2h2v2h2V2h2v2h2a2 2 0 0 1 2 2v2h2v2h-2v2h2v2h-2v2a2 2 0 0 1-2 2h-2v2h-2v-2h-2v2H9v-2H7a2 2 0 0 1-2-2v-2H3v-2h2v-2H3V8h2V6a2 2 0 0 1 2-2h2V2ZM7 6v12h10V6H7Zm2 2h6v8H9V8Zm2 2v4h2v-4h-2Z" />
    </svg>
  );
}

export function LinkIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M10.6 13.4a1 1 0 0 1 0-1.4l3.5-3.5a1 1 0 1 1 1.4 1.4L12 13.4a1 1 0 0 1-1.4 0ZM7.1 19.1a4 4 0 0 1 0-5.7l2.1-2.1 1.4 1.4-2.1 2.1a2 2 0 0 0 2.8 2.8l2.1-2.1 1.4 1.4-2.1 2.1a4 4 0 0 1-5.6.1Zm9.8-6.4-1.4-1.4 2.1-2.1a2 2 0 0 0-2.8-2.8l-2.1 2.1-1.4-1.4 2.1-2.1a4 4 0 0 1 5.6 5.7l-2.1 2Z" />
    </svg>
  );
}
