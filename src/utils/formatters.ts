// Common formatting utilities to reduce duplication

export function formatList(
  items: Array<Record<string, unknown>>,
  formatter: (item: Record<string, unknown>) => string[],
  emptyMessage: string,
): string {
  if (items.length === 0) {
    return emptyMessage;
  }

  const lines: string[] = [];
  for (const item of items) {
    lines.push('---');
    lines.push(...formatter(item));
    lines.push('');
  }

  return lines.join('\n');
}

export function formatField(label: string, value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  return `${label}: ${String(value)}`;
}

export function formatFields(fields: Array<{ label: string; value: unknown }>): string[] {
  return fields
    .map(({ label, value }) => formatField(label, value))
    .filter((line): line is string => line !== null);
}
