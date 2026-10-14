import { Fragment, type ReactNode } from "react";

/**
 * Minimal Markdown for chat answers: paragraphs, bullet/numbered lists, headings,
 * tables (GFM: header row + `|---|` separator), **bold**, *italic* and `code`. Builds React elements only - model output is never
 * injected as HTML, so there's nothing to sanitize and no XSS surface.
 */
export function MarkdownText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    if (isTableStart(lines, i)) {
      const header = cells(lines[i]);
      const align = cells(lines[i + 1]).map((c) => (c.endsWith(":") ? "right" : "left"));
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(cells(lines[i]));
        i++;
      }
      // Money and numbers read best right-aligned, even when the model didn't say so.
      const numeric = header.map((_, col) => rows.length > 0 && rows.every((r) => !r[col] || NUMERIC.test(r[col])));
      const cellClass = (col: number) =>
        `whitespace-nowrap px-2 py-1 ${align[col] === "right" || numeric[col] ? "text-right tabular-nums" : "text-left"}`;
      blocks.push(
        <div key={blocks.length} className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
          <table className="w-full text-[0.92em]">
            <thead className="bg-black/[0.04] dark:bg-white/[0.06]">
              <tr>
                {header.map((h, col) => (
                  <th key={col} className={`${cellClass(col)} font-semibold`}>
                    {inline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {rows.map((row, r) => (
                <tr key={r}>
                  {header.map((_, col) => (
                    <td key={col} className={cellClass(col)}>
                      {inline(row[col] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    const bullet = /^\s*[-*•]\s+(.*)$/;
    const numbered = /^\s*\d+[.)]\s+(.*)$/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const pattern = ordered ? numbered : bullet;
      const items: string[] = [];
      while (i < lines.length && pattern.test(lines[i])) {
        items.push(lines[i].match(pattern)![1]);
        i++;
      }
      const ListTag = ordered ? "ol" : "ul";
      blocks.push(
        <ListTag key={blocks.length} className={`${ordered ? "list-decimal" : "list-disc"} space-y-0.5 pl-5`}>
          {items.map((item, idx) => (
            <li key={idx}>{inline(item)}</li>
          ))}
        </ListTag>
      );
      continue;
    }

    const heading = line.match(/^\s*#{1,6}\s+(.*)$/);
    if (heading) {
      blocks.push(
        <p key={blocks.length} className="font-semibold">
          {inline(heading[1])}
        </p>
      );
      i++;
      continue;
    }

    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !bullet.test(lines[i]) &&
      !numbered.test(lines[i]) &&
      !isTableStart(lines, i)
    ) {
      paragraph.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={blocks.length}>
        {paragraph.map((l, idx) => (
          <Fragment key={idx}>
            {idx > 0 && <br />}
            {inline(l)}
          </Fragment>
        ))}
      </p>
    );
  }

  return <div className="flex flex-col gap-2">{blocks}</div>;
}

const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const NUMERIC = /^[*_]*\s*(R\$|US\$|€|-|\+)?\s*-?[\d.,]+\s*%?[*_]*$/;

/** A table starts with a row containing "|" followed by a `---|---` separator line. */
function isTableStart(lines: string[], i: number): boolean {
  return lines[i].includes("|") && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1]);
}

function cells(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(text.slice(last, index));
    const token = match[0];
    if (token.startsWith("**")) parts.push(<strong key={index}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`")) {
      parts.push(
        <code key={index} className="rounded bg-black/5 px-1 py-0.5 text-[0.9em] dark:bg-white/10">
          {token.slice(1, -1)}
        </code>
      );
    } else parts.push(<em key={index}>{token.slice(1, -1)}</em>);
    last = index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
