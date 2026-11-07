// SPDX-License-Identifier: Apache-2.0
import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdmission } from "./lib/security/admission";
import { contentSecurityPolicy, routePolicy } from "./lib/security/policy";

const admit = createAdmission();

/** Apply common admission and a fresh CSP nonce before routing. @example proxy(new NextRequest(url)) */
export function proxy(request: NextRequest) {
  const nonce = randomBytes(24).toString("base64");
  const csp = contentSecurityPolicy(nonce, process.env.NODE_ENV === "development");
  const denied = admit(request);
  if (denied) {
    denied.headers.set("Content-Security-Policy", csp);
    return denied;
  }
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  // HTML nonces must never be stored in a shared cache. Data routes keep their own cache policy.
  if (
    !routePolicy(request.nextUrl.pathname) &&
    !/\.(?:json|xml|ico|png|svg)$/.test(request.nextUrl.pathname) &&
    !request.nextUrl.pathname.includes("opengraph-image")
  )
    response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
