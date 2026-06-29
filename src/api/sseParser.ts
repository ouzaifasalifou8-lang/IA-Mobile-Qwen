/**
 * Parses a single SSE line: "data: {json}" -> object, "data: [DONE]" -> 'done', other -> null
 * Handles malformed responses and non-JSON data gracefully.
 */
export function parseSSELine(line: string): object | null | 'done' {
  if (!line.startsWith('data: ')) {
    return null;
  }

  const data = line.slice(6).trim();

  if (data === '[DONE]') {
    return 'done';
  }

  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Stateful SSE parser that handles incomplete lines split across chunks.
 */
export class SSEParser {
  private buffer = '';

  *feed(chunk: string): Generator<object | 'done'> {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const result = parseSSELine(trimmed);
      if (result !== null) {
        yield result;
      }
    }
  }

  *flush(): Generator<object | 'done'> {
    if (this.buffer.trim()) {
      const result = parseSSELine(this.buffer.trim());
      if (result !== null) {
        yield result;
      }
    }
    this.buffer = '';
  }
}
