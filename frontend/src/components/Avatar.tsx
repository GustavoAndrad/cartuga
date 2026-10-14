import { useEffect, useState } from "react";

interface AvatarProps {
  photo: string | null;
  name: string;
  size?: number;
}

export function Avatar({ photo, name, size = 36 }: AvatarProps) {
  const style = { width: size, height: size };
  // A photo URL that doesn't load (moved, expired, blocked) falls back to the
  // placeholder instead of a broken-image icon with clipped alt text.
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photo]);

  if (photo && !failed) {
    return (
      <img
        src={photo}
        alt={name}
        onError={() => setFailed(true)}
        style={style}
        className="rounded-full object-cover border border-neutral-300 dark:border-neutral-700"
      />
    );
  }

  return (
    <div
      style={style}
      title={name}
      className="flex items-center justify-center rounded-full bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: size * 0.6, height: size * 0.6 }}>
        <path d="M12 12c2.7 0 4.9-2.2 4.9-4.9S14.7 2.2 12 2.2 7.1 4.4 7.1 7.1 9.3 12 12 12Zm0 2.5c-3.3 0-9.8 1.6-9.8 4.9v2.4h19.6v-2.4c0-3.3-6.5-4.9-9.8-4.9Z" />
      </svg>
    </div>
  );
}
