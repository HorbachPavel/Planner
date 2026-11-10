const BULLET = "- ";

export function applyNoteEnter(
  value: string,
  start: number,
  end: number,
): { value: string; cursor: number } {
  if (!value) return { value: BULLET, cursor: BULLET.length };

  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const lineBeforeCursor = value.slice(lineStart, start);
  if (/^\s*[-•*]\s*$/.test(lineBeforeCursor) && start === end) {
    return { value: value.slice(0, lineStart) + value.slice(end), cursor: lineStart };
  }

  const insert = `\n${BULLET}`;
  return {
    value: `${value.slice(0, start)}${insert}${value.slice(end)}`,
    cursor: start + insert.length,
  };
}

export function prefixFirstNoteLine(previous: string, next: string): string {
  if (previous === "" && next && !/^[-•*]\s/.test(next) && !next.includes("\n")) {
    return `${BULLET}${next}`;
  }
  return next;
}
