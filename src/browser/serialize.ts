export interface SerializeLimits {
  maxDepth: number;
  maxStringLength: number;
  maxEntryLength: number;
}

export const DEFAULT_SERIALIZE_LIMITS: SerializeLimits = {
  maxDepth: 4,
  maxStringLength: 2_000,
  maxEntryLength: 8_000,
};

function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}…[truncated ${text.length} chars]` : text;
}

/** Serializes one value into something JSON-safe, marking cycles and depth cuts. */
export function serializeValue(
  value: unknown,
  limits: SerializeLimits = DEFAULT_SERIALIZE_LIMITS,
  depth = 0,
  seen: unknown[] = [],
): unknown {
  if (value === null) {
    return null;
  }

  switch (typeof value) {
    case 'string':
      return truncate(value, limits.maxStringLength);
    case 'number':
    case 'boolean':
      return value;
    case 'undefined':
      return '[undefined]';
    case 'bigint':
      return `${value.toString()}n`;
    case 'symbol':
      return value.toString();
    case 'function':
      return `[Function ${value.name || 'anonymous'}]`;
  }

  if (seen.includes(value)) {
    return '[Circular]';
  }
  if (depth >= limits.maxDepth) {
    return '[MaxDepth]';
  }

  const nextSeen = [...seen, value];

  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncate(value.message, limits.maxStringLength),
      stack: value.stack === undefined ? undefined : truncate(value.stack, limits.maxStringLength),
    };
  }
  if (value instanceof Map) {
    return serializeValue([...value.entries()], limits, depth + 1, nextSeen);
  }
  if (value instanceof Set) {
    return serializeValue([...value.values()], limits, depth + 1, nextSeen);
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeValue(item, limits, depth + 1, nextSeen));
  }

  const record: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    record[key] = serializeValue(item, limits, depth + 1, nextSeen);
  }
  return record;
}

/** Serializes console arguments, capping the whole entry so one log cannot flood the store. */
export function serializeArgs(
  args: unknown[],
  limits: SerializeLimits = DEFAULT_SERIALIZE_LIMITS,
): unknown[] {
  const serialized = args.map((arg) => serializeValue(arg, limits));

  const encoded = JSON.stringify(serialized) ?? '';
  if (encoded.length <= limits.maxEntryLength) {
    return serialized;
  }

  return [`[entry truncated: ${encoded.length} chars]`];
}
