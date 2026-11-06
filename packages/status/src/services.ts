// SPDX-License-Identifier: Apache-2.0
export const SERVICES = [
  {
    id: "gateway",
    name: "Gateway",
    url: "https://api.flop.network/v1/models",
    method: "GET",
    check: "JSON model list with string ids",
  },
  {
    id: "mcp",
    name: "Hosted MCP",
    url: "https://mcp.flop.network/mcp",
    method: "initialize",
    check: "JSON-RPC initialize with protocol, server info and capabilities",
  },
  {
    id: "docs",
    name: "Docs",
    url: "https://docs.flop.network/llms.txt",
    method: "GET",
    check: "FLOP docs index with a docs link",
  },
  {
    id: "assistant",
    name: "Docs assistant",
    url: "https://ask.flop.finance/mcp",
    method: "initialize",
    check: "JSON-RPC initialize with protocol, server info and capabilities",
  },
  {
    id: "explorer",
    name: "Explorer page",
    url: "https://explorer.devnet.flop.network/",
    method: "GET",
    check: "HTML with a FLOP explorer title and application markup",
  },
  {
    id: "faucet",
    name: "Faucet page",
    url: "https://faucet.flop.network/",
    method: "GET",
    check: "HTML with a FLOP faucet title and application markup",
  },
  {
    id: "chat",
    name: "Technocore health",
    url: "https://technocore.chat/healthz",
    method: "GET",
    check: "Plain text ok",
  },
  {
    id: "npm",
    name: "npm SDK metadata",
    url: "https://registry.npmjs.org/@flop-labs/sdk/latest",
    method: "GET",
    check: "SDK package name, version and HTTPS tarball",
  },
] as const;
export type ServiceId = (typeof SERVICES)[number]["id"];

/** Object guard shared by network and archive validators. @example object({ data: [] }) */
export function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Check the initialize fields without treating advertised capabilities as tested tools. @example validInitialize(result) */
export function validInitialize(value: unknown): boolean {
  return (
    object(value) &&
    typeof value.protocolVersion === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value.protocolVersion) &&
    object(value.capabilities) &&
    object(value.serverInfo) &&
    typeof value.serverInfo.name === "string" &&
    value.serverInfo.name.length > 0 &&
    typeof value.serverInfo.version === "string" &&
    value.serverInfo.version.length > 0
  );
}

/** Validate the cheap endpoint's content, not the service behind it. @example checkContent("chat", "ok\n", "text/plain") */
export function checkContent(id: ServiceId, body: string, contentType: string): boolean {
  if (id === "chat") return contentType.includes("text/plain") && body.trim() === "ok";
  if (id === "docs")
    return (
      !contentType.includes("text/html") && /flop/i.test(body) && /https:\/\/docs\.flop\.network\/docs\//.test(body)
    );
  if (id === "explorer" || id === "faucet") {
    const title = body.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? "";
    return (
      contentType.includes("text/html") &&
      /flop/i.test(title) &&
      new RegExp(id, "i").test(title) &&
      /<(?:main|div)\b/i.test(body)
    );
  }
  if (id === "mcp" || id === "assistant") return false; // Shared MCP transport parses these responses.
  if (!contentType.includes("json")) return false;
  try {
    const value: unknown = JSON.parse(body);
    if (!object(value)) return false;
    if (id === "gateway")
      return (
        value.object === "list" &&
        Array.isArray(value.data) &&
        value.data.every((item: unknown) => object(item) && typeof item.id === "string" && item.id.length > 0)
      );
    return (
      value.name === "@flop-labs/sdk" &&
      typeof value.version === "string" &&
      /^\d+\.\d+\.\d+(?:[-+].+)?$/.test(value.version) &&
      object(value.dist) &&
      typeof value.dist.tarball === "string" &&
      value.dist.tarball.startsWith("https://registry.npmjs.org/")
    );
  } catch {
    return false;
  }
}
