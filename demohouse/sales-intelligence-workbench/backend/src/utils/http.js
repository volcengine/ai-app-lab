import { makeRequestId } from "./ids.js";

export class HttpError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function parseAllowedOrigins(value = "") {
  return String(value || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isOriginAllowed(req, allowedOrigins = []) {
  const origin = String(req?.headers?.origin || "").trim();
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    const requestHost = String(req?.headers?.host || "").trim().toLowerCase();
    if (requestHost && originUrl.host.toLowerCase() === requestHost) return true;
  } catch {
    return false;
  }
  return allowedOrigins.includes(origin);
}

export function withCors(req, res, allowedOrigins = []) {
  const origin = String(req?.headers?.origin || "").trim();
  if (!origin || !allowedOrigins.includes(origin)) return;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-CSRF-Token");
  res.setHeader("Access-Control-Max-Age", "600");
}

export function withSecurityHeaders(res, options = {}) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Content-Security-Policy", "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'");
  if (options.api) res.setHeader("Cache-Control", "no-store");
}

export function sendJson(res, status, payload, headers = {}) {
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

export function ok(res, data, meta = {}) {
  sendJson(res, 200, {
    data,
    meta: {
      request_id: meta.request_id || makeRequestId(),
      ...meta,
    },
  });
}

export function created(res, data, meta = {}) {
  sendJson(res, 201, {
    data,
    meta: {
      request_id: meta.request_id || makeRequestId(),
      ...meta,
    },
  });
}

export function accepted(res, data, meta = {}) {
  sendJson(res, 202, {
    data,
    meta: {
      request_id: meta.request_id || makeRequestId(),
      ...meta,
    },
  });
}

export function fail(res, error, requestId = makeRequestId()) {
  const status = error instanceof HttpError ? error.status : 500;
  const code = error instanceof HttpError ? error.code : "internal_error";
  const message = error instanceof HttpError ? error.message : "Unexpected server error.";
  const details = error instanceof HttpError ? error.details : {};
  sendJson(res, status, {
    error: {
      code,
      message,
      details,
    },
    meta: {
      request_id: requestId,
    },
  });
}

export async function readJson(req, options = {}) {
  const maxBytes = Math.max(1024, Number(options.maxBytes) || 1024 * 1024);
  const declaredLength = Number(req.headers?.["content-length"] || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new HttpError(413, "payload_too_large", `Request body exceeds the ${maxBytes}-byte limit.`);
  }
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > maxBytes) {
      throw new HttpError(413, "payload_too_large", `Request body exceeds the ${maxBytes}-byte limit.`);
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "bad_request", "Request body must be valid JSON.");
  }
}

export function parseUrl(req) {
  return new URL(req.url, "http://localhost");
}
