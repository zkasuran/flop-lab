// SPDX-License-Identifier: Apache-2.0

/** One server-sent event: its `event` name and the joined `data` lines. */
export interface SseEvent {
  event: string;
  data: string;
}

/**
 * Parses a complete server-sent-events body. Events are separated by a blank line. Multiple `data:` lines of one
 * event are joined with LF. Comment lines (starting with `:`) are ignored. CRLF is accepted.
 */
export function parseSse(body: string): SseEvent[] {
  const events: SseEvent[] = [];
  for (const block of body.replace(/\r\n/g, "\n").split(/\n\n+/)) {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith(":") || line === "") continue;
      const i = line.indexOf(":");
      const field = i === -1 ? line : line.slice(0, i);
      const value = i === -1 ? "" : line.slice(i + 1).replace(/^ /, "");
      if (field === "event") event = value;
      else if (field === "data") data.push(value);
    }
    if (data.length > 0) events.push({ event, data: data.join("\n") });
  }
  return events;
}
