/**
 * Parses a single SSE line: "data: {json}" -> object, "data: [DONE]" -> 'done', other -> null
 * Handles malformed responses and non-JSON data gracefully.
 */
export function parseSSELine(line: string): object | null | 'done' {
  // Si la ligne ne commence pas par "data: ", on l'ignore silencieusement
  if (!line.startsWith('data: ')) {
    // Ignorer les fragments qui commencent par 'd' (caractères malformés)
    if (line.trim().startsWith('d')) {
      return null;
    }
    return null;
  }

  const data = line.slice(6).trim();

  if (data === '[DONE]') {
    return 'done';
  }

  try {
    return JSON.parse(data);
  } catch (e) {
    // Si le parse échoue, on ignore la ligne et on continue
    console.warn('[SSE] Ligne non-JSON ignorée:', data.substring(0, 50));
    return null;
  }
}

/**
 * Stateful SSE parser that handles incomplete lines split across chunks.
 * Usage: create once per stream, call feed() for each chunk.
 */
export class SSEParser {
  private buffer = '';

  /**
   * Feed a chunk of SSE data. Yields parsed events.
   * Buffers incomplete lines across calls (handles chunks split mid-line).
   */
  *feed(chunk: string): Generator<object | 'done'> {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    // Last element may be incomplete (no trailing newline) - keep it in buffer
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue; // Skip empty lines between events
      }
      const result = parseSSELine(trimmed);
      if (result !== null) {
        yield result;
      }
    }
  }

  /**
   * Flush any remaining data in the buffer (call at end of stream).
   */
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

fix: handle non-JSON SSE lines from Groq API
