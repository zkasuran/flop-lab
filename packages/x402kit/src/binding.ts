// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { PaymentError } from "./protocol.js";
import { bindingHeaders } from "./rules.js";

/** Hash the method, URL, body and application headers. @example await bindRequest(request) */
export async function bindRequest(request: Request): Promise<string> {
  const reader = request.clone().body?.getReader();
  const hash = createHash("sha256");
  let size = 0;
  if (reader) {
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > 65536) throw new PaymentError("request_too_large", 413);
        hash.update(chunk.value);
      }
    } finally {
      void reader.cancel();
    }
  }
  return createHash("sha256")
    .update(JSON.stringify([request.method, request.url, bindingHeaders([...request.headers]), hash.digest("hex")]))
    .digest("hex");
}
