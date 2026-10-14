/**
 * The Assistente Cartuga's mark: the logo's turtle silhouette (same flat shapes and
 * brand greens), with a pair of round accountant's glasses cut out of the head.
 * `cutColor` must match whatever the glyph sits on, so the glasses read as holes.
 */
export function AssistantGlyph({ className = "h-5 w-5", cutColor }: { className?: string; cutColor: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden>
      <g fill="currentColor">
        <rect x="20" y="62" width="80" height="44" rx="10" />
        <ellipse cx="60" cy="60" rx="27" ry="21" />
        <circle cx="60" cy="28" r="15" />
        <ellipse cx="27" cy="54" rx="9" ry="5.5" transform="rotate(-25 27 54)" />
        <ellipse cx="93" cy="54" rx="9" ry="5.5" transform="rotate(25 93 54)" />
      </g>
      <g fill="none" style={{ stroke: cutColor }} strokeWidth="3.2">
        <circle cx="54" cy="27" r="5" />
        <circle cx="66" cy="27" r="5" />
        <path d="M59 26.5h2" />
      </g>
    </svg>
  );
}

/** Round avatar used next to the assistant's messages. */
export function AssistantAvatar({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Assistente Cartuga"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-cartuga-700 text-cartuga-50 ${className}`}
    >
      <AssistantGlyph className="h-[68%] w-[68%]" cutColor="#1d4726" />
    </span>
  );
}
