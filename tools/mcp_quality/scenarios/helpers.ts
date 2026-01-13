import type { McpCallResult } from '../mcp/client.js';

/**
 * Extracts the first JSON-ish payload from an MCP tool result.
 * Tries native json entries, then looks for a ```json ...``` block, then raw JSON string.
 */
export function extractJson<T = unknown>(result: McpCallResult): T | undefined {
  if (result.json.length > 0) {
    return result.json[0] as T;
  }

  for (const text of result.text) {
    const fenced = text.match(/```json\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1]) as T;
      } catch (_error) {
        // ignore
      }
    }
    try {
      return JSON.parse(text.trim()) as T;
    } catch (_error) {
      // ignore
    }
  }

  return undefined;
}
