// SPDX-License-Identifier: Apache-2.0
// Loaded in Next build workers and the production server, never in the shipped app.
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import process from "node:process";
import { URL } from "node:url";

const originalFetch = globalThis.fetch;
const RealDate = Date;
// A test clock, not a new observation. Keep SSR and hydration timestamps identical.
globalThis.Date = class extends RealDate {
  constructor(...args) {
    super(...(args.length ? args : ["2026-11-06T00:00:00.000Z"]));
  }
  static now() {
    return new RealDate("2026-11-06T00:00:00.000Z").getTime();
  }
  static parse(value) {
    return RealDate.parse(value);
  }
  static UTC(...args) {
    return RealDate.UTC(...args);
  }
};
const connect = net.Socket.prototype.connect;
const local = (host) => ["127.0.0.1", "localhost", "::1", "[::1]"].includes(host);

// A second guard catches HTTP clients that bypass fetch. Unix sockets remain local.
net.Socket.prototype.connect = function (...args) {
  const normalized = Array.isArray(args[0]) ? args[0] : args;
  const options = typeof normalized[0] === "object" ? normalized[0] : undefined;
  const host = options?.host ?? (typeof normalized[1] === "string" ? normalized[1] : "localhost");
  if (!local(host)) throw new Error(`E2E blocked external socket: ${host}`);
  return connect.apply(this, args);
};
syncBuiltinESMExports();

globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (local(url.hostname)) return originalFetch(input, init);
  // Fail immediately so server pages use their own dated recorded fallbacks.
  throw new Error(`E2E offline: ${url.origin}${url.pathname}`);
};

// Next's child workers must inherit the guard as well.
const option = `--import=${import.meta.url}`;
if (!(process.env.NODE_OPTIONS ?? "").includes(option)) {
  process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ""} ${option}`.trim();
}
