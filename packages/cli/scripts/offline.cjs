// SPDX-License-Identifier: Apache-2.0
// Audit-only guard. Refuse network access before a measured child can make a request.
/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
const deny = () => {
  throw new Error("CLI_AUDIT_NETWORK_BLOCKED");
};
globalThis.fetch = deny;
require("node:http").request = deny;
require("node:http").get = deny;
require("node:https").request = deny;
require("node:https").get = deny;
require("node:net").Socket.prototype.connect = deny;
require("node:tls").connect = deny;
