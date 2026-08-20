import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { HttpError } from "../utils/http.js";

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const ROLE_LEVEL = Object.freeze({ viewer: 0, member: 1, admin: 2, owner: 3 });
const AUDIT_FILTER_PATTERN = /^[a-z0-9_.:-]+$/i;
const AUDIT_SECRET_KEY_PATTERN = /(?:authorization|cookie|password|secret|token|api[_-]?key|raw[_-]?ref|openviking[_-]?(?:uri|ref))/i;

function enabled(value) {
  return TRUE_VALUES.has(String(value || "").trim().toLowerCase());
}

function authBaseUrl(value) {
  return String(value || "").trim().replace(/\/$/, "").replace(/\/rest\/v1$/, "");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeUsername(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function validateEmail(value) {
  const email = normalizeEmail(value);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "invalid_email", "请输入有效的邮箱地址。");
  }
  return email;
}

function validateUsername(value) {
  const username = normalizeUsername(value);
  if (
    username.length < 2
    || username.length > 40
    || /[@\u0000-\u001f\u007f]/u.test(username)
  ) {
    throw new HttpError(400, "invalid_username", "用户名需要为 2 至 40 个字符，不能包含 @ 或控制字符。");
  }
  return username;
}

function validatePassword(value) {
  const password = String(value || "");
  if (password.length < 10 || password.length > 256) {
    throw new HttpError(400, "weak_password", "密码长度需要为 10 至 256 个字符。");
  }
  return password;
}

function internalOwnerEmail(workspaceId) {
  const suffix = createHash("sha256").update(String(workspaceId || "")).digest("hex").slice(0, 24);
  return `owner-${suffix}@sales-workbench.invalid`;
}

function parseCookies(header = "") {
  const cookies = {};
  for (const item of String(header || "").split(";")) {
    const separator = item.indexOf("=");
    if (separator < 1) continue;
    const name = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path || "/"}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  parts.push(`SameSite=${options.sameSite || "Strict"}`);
  return parts.join("; ");
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

function tokenHash(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

function sanitizeAuditValue(value, depth = 0) {
  if (value === null || value === undefined) return null;
  if (depth > 4) return "[depth-limited]";
  if (typeof value === "string") return value.slice(0, 1000);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeAuditValue(item, depth + 1));
  if (typeof value !== "object") return String(value).slice(0, 1000);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !AUDIT_SECRET_KEY_PATTERN.test(String(key)))
      .slice(0, 50)
      .map(([key, item]) => [String(key).slice(0, 120), sanitizeAuditValue(item, depth + 1)]),
  );
}

function auditFilter(value, name, maxLength) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length > maxLength || !AUDIT_FILTER_PATTERN.test(text)) {
    throw new HttpError(400, "invalid_audit_filter", `审计筛选条件 ${name} 无效。`);
  }
  return text;
}

function safeAuthError(status, body, context = "session") {
  const code = String(body?.error_code || body?.code || body?.error || `auth_http_${status}`);
  const message = String(body?.msg || body?.message || "");
  const expiredJwt = status === 403 && /(?:bad_jwt|invalid jwt|jwt.{0,40}expired|token.{0,20}expired)/i.test(`${code} ${message}`);
  if (status === 400 || status === 401 || expiredJwt) {
    return new HttpError(401, "invalid_credentials", "用户名或密码不正确，或登录会话已经过期。");
  }
  if (status === 422 || /already|registered|exists/i.test(message)) {
    return new HttpError(409, "account_exists", "管理员账号已经创建，请直接登录。");
  }
  return new HttpError(502, "auth_provider_error", "身份服务暂时不可用，请稍后重试。", { provider_code: code });
}

function validateLoginCredentials(body) {
  const identifier = String(body?.username || body?.account || body?.email || "").trim();
  if (!identifier) throw new HttpError(400, "username_required", "请输入用户名。");
  const password = validatePassword(body?.password);
  return { identifier, password };
}

function publicUser(principal) {
  if (!principal) return null;
  return {
    id: principal.id,
    username: principal.username,
    display_name: principal.display_name,
  };
}

export class AuthService {
  constructor(options = {}) {
    this.env = options.env;
    this.fetch = options.fetchImpl || fetch;
    this.dataProvider = options.dataProvider;
    this.baseUrl = authBaseUrl(this.env?.value?.("SUPABASE_API_URL", ""));
    this.serviceRoleKey = this.env?.value?.("SUPABASE_SERVICE_ROLE_KEY", "") || "";
    this.workspaceId = this.env?.value?.("APP_WORKSPACE_ID", "") || "";
    this.authEnabled = enabled(this.env?.value?.("HTTP_AUTH_ENABLED", "false"));
    this.bootstrapEnabled = enabled(this.env?.value?.("AUTH_BOOTSTRAP_ENABLED", "true"));
    this.cookieSecure = enabled(this.env?.value?.("AUTH_COOKIE_SECURE", "false"));
    this.timeoutMs = this.env?.number?.("AUTH_PROVIDER_TIMEOUT_MS", 12000) || 12000;
    this.cacheTtlMs = this.env?.number?.("AUTH_SESSION_CACHE_TTL_MS", 15000) || 15000;
    this.refreshMaxAge = this.env?.number?.("AUTH_REFRESH_COOKIE_MAX_AGE", 31536000) || 31536000;
    this.cache = new Map();
    this.bootstrapPromise = null;
    this.cookieNames = Object.freeze({
      access: "siw_access",
      refresh: "siw_refresh",
      csrf: "siw_csrf",
    });
  }

  isEnabled() {
    return this.authEnabled;
  }

  isConfigured() {
    return Boolean(this.baseUrl && this.serviceRoleKey && this.workspaceId && this.dataProvider?.isConfigured?.());
  }

  assertConfigured() {
    if (!this.isConfigured()) {
      throw new HttpError(503, "auth_not_configured", "身份认证尚未完成配置。");
    }
  }

  async authRequest(path, options = {}) {
    this.assertConfigured();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(`${this.baseUrl}/auth/v1/${String(path).replace(/^\//, "")}`, {
        method: options.method || "GET",
        headers: {
          Accept: "application/json",
          apikey: this.serviceRoleKey,
          Authorization: `Bearer ${options.accessToken || this.serviceRoleKey}`,
          ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
      const text = await response.text();
      let body = {};
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = {};
      }
      if (!response.ok) throw safeAuthError(response.status, body, options.context);
      return body;
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new HttpError(504, "auth_timeout", "身份服务响应超时，请稍后重试。");
      }
      if (error instanceof HttpError) throw error;
      throw new HttpError(502, "auth_unreachable", "无法连接身份服务，请稍后重试。");
    } finally {
      clearTimeout(timeout);
    }
  }

  async isBootstrapRequired() {
    if (!this.authEnabled || !this.bootstrapEnabled || !this.isConfigured()) return false;
    const bindings = await this.dataProvider.select("app_workspace_members", {
      select: "user_id",
      filters: { workspace_id: `eq.${this.workspaceId}` },
      limit: 1,
    });
    return !Array.isArray(bindings) || bindings.length === 0;
  }

  async singleLoginAccount() {
    const bindings = await this.dataProvider.select("app_workspace_members", {
      select: "workspace_id,user_id,role",
      filters: {
        workspace_id: `eq.${this.workspaceId}`,
      },
      limit: 2,
    });
    if (!Array.isArray(bindings) || bindings.length !== 1) {
      throw new HttpError(503, "single_user_account_invalid", "本机管理员账号状态异常，请检查安装配置。");
    }
    const binding = bindings[0];
    const profiles = await this.dataProvider.select("app_users", {
      select: "id,display_name",
      filters: { id: `eq.${binding.user_id}` },
      limit: 1,
    });
    const username = normalizeUsername(profiles?.[0]?.display_name || "");
    if (!username) {
      throw new HttpError(503, "single_user_account_invalid", "本机管理员用户名缺失，请检查安装配置。");
    }
    return { id: binding.user_id, username };
  }

  async resolveLoginEmail(identifier) {
    if (String(identifier).includes("@")) return validateEmail(identifier);
    const username = validateUsername(identifier);
    const account = await this.singleLoginAccount();
    if (normalizeUsername(account.username).toLowerCase() !== username.toLowerCase()) {
      throw new HttpError(401, "invalid_credentials", "用户名或密码不正确，或登录会话已经过期。");
    }
    const result = await this.authRequest(`admin/users/${encodeURIComponent(account.id)}`);
    const user = result?.user || result;
    if (!user?.email) {
      throw new HttpError(503, "single_user_account_invalid", "本机管理员账号无法登录，请检查安装配置。");
    }
    return validateEmail(user.email);
  }

  async principalForUser(user) {
    const memberships = await this.dataProvider.select("app_workspace_members", {
      select: "workspace_id,user_id,role",
      filters: {
        workspace_id: `eq.${this.workspaceId}`,
        user_id: `eq.${user.id}`,
      },
      limit: 1,
    });
    const membership = memberships?.[0];
    if (!membership || !Object.hasOwn(ROLE_LEVEL, membership.role)) {
      throw new HttpError(403, "workspace_access_denied", "当前账号没有访问此工作区的权限。");
    }
    const profiles = await this.dataProvider.select("app_users", {
      select: "id,display_name",
      filters: { id: `eq.${user.id}` },
      limit: 1,
    });
    return Object.freeze({
      id: user.id,
      email: normalizeEmail(user.email),
      username: normalizeUsername(profiles?.[0]?.display_name || user.user_metadata?.username || user.user_metadata?.display_name || "管理员"),
      display_name: normalizeUsername(profiles?.[0]?.display_name || user.user_metadata?.username || user.user_metadata?.display_name || "管理员"),
      workspace_id: membership.workspace_id,
      role: membership.role,
    });
  }

  async verifyAccessToken(accessToken) {
    if (!accessToken) throw new HttpError(401, "authentication_required", "请先登录。");
    const key = tokenHash(accessToken);
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.principal;
    const user = await this.authRequest("user", { accessToken });
    const principal = await this.principalForUser(user);
    this.cache.set(key, { principal, expiresAt: Date.now() + this.cacheTtlMs });
    return principal;
  }

  async passwordSessionByEmail(email, password) {
    const session = await this.authRequest("token?grant_type=password", {
      method: "POST",
      body: { email, password },
    });
    const principal = await this.verifyAccessToken(session.access_token);
    return { ...session, principal };
  }

  async passwordSession(identifier, password) {
    return this.passwordSessionByEmail(await this.resolveLoginEmail(identifier), password);
  }

  async refreshSession(refreshToken) {
    if (!refreshToken) throw new HttpError(401, "authentication_required", "请先登录。");
    const session = await this.authRequest("token?grant_type=refresh_token", {
      method: "POST",
      body: { refresh_token: refreshToken },
    });
    const principal = await this.verifyAccessToken(session.access_token);
    return { ...session, principal };
  }

  setSessionCookies(res, session, csrfToken = randomBytes(24).toString("base64url")) {
    const accessMaxAge = Math.max(60, Number(session.expires_in) || 3600);
    res.setHeader("Set-Cookie", [
      serializeCookie(this.cookieNames.access, session.access_token, {
        httpOnly: true,
        secure: this.cookieSecure,
        maxAge: accessMaxAge,
      }),
      serializeCookie(this.cookieNames.refresh, session.refresh_token, {
        httpOnly: true,
        secure: this.cookieSecure,
        maxAge: this.refreshMaxAge,
      }),
      serializeCookie(this.cookieNames.csrf, csrfToken, {
        httpOnly: false,
        secure: this.cookieSecure,
        maxAge: this.refreshMaxAge,
      }),
    ]);
    return csrfToken;
  }

  clearSessionCookies(res) {
    res.setHeader("Set-Cookie", Object.values(this.cookieNames).map((name) => serializeCookie(name, "", {
      httpOnly: name !== this.cookieNames.csrf,
      secure: this.cookieSecure,
      maxAge: 0,
    })));
  }

  async authenticateRequest(req, res) {
    if (!this.authEnabled) {
      return {
        principal: Object.freeze({
          id: "auth-disabled-diagnostic",
          email: "",
          display_name: "本地开发者",
          workspace_id: this.workspaceId,
          role: "owner",
        }),
        source: "disabled",
      };
    }
    this.assertConfigured();
    const authorization = String(req.headers?.authorization || "");
    const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
    const cookies = parseCookies(req.headers?.cookie);
    const accessToken = bearer || cookies[this.cookieNames.access] || "";
    if (!accessToken) {
      if (!cookies[this.cookieNames.refresh]) return null;
      try {
        const session = await this.refreshSession(cookies[this.cookieNames.refresh]);
        this.setSessionCookies(res, session, cookies[this.cookieNames.csrf] || undefined);
        return { principal: session.principal, source: "cookie" };
      } catch (refreshError) {
        this.clearSessionCookies(res);
        if (refreshError?.status === 403) throw refreshError;
        return null;
      }
    }
    try {
      return {
        principal: await this.verifyAccessToken(accessToken),
        source: bearer ? "bearer" : "cookie",
      };
    } catch (error) {
      if (bearer || error?.status === 403 || !cookies[this.cookieNames.refresh]) throw error;
      try {
        const session = await this.refreshSession(cookies[this.cookieNames.refresh]);
        this.setSessionCookies(res, session, cookies[this.cookieNames.csrf] || undefined);
        return { principal: session.principal, source: "cookie" };
      } catch (refreshError) {
        this.clearSessionCookies(res);
        if (refreshError?.status === 403) throw refreshError;
        return null;
      }
    }
  }

  requireRole(auth, minimumRole) {
    if (!auth?.principal) throw new HttpError(401, "authentication_required", "请先登录。");
    const actual = ROLE_LEVEL[auth.principal.role];
    const required = ROLE_LEVEL[minimumRole];
    if (!Number.isInteger(actual) || !Number.isInteger(required) || actual < required) {
      throw new HttpError(403, "insufficient_role", "当前账号没有执行此操作的权限。", {
        required_role: minimumRole,
      });
    }
  }

  async recordAudit(auth, event = {}) {
    const action = String(event.action || "").trim().slice(0, 120);
    if (!action || !AUDIT_FILTER_PATTERN.test(action) || !this.workspaceId || !this.dataProvider?.insert) return false;
    try {
      await this.dataProvider.insert("audit_events", [{
        id: `audit_${randomUUID()}`,
        workspace_id: this.workspaceId,
        actor_user_id: /^[0-9a-f-]{36}$/i.test(String(auth?.principal?.id || "")) ? auth.principal.id : null,
        action,
        entity_type: String(event.entity_type || "").trim().slice(0, 80) || null,
        entity_id: String(event.entity_id || "").trim().slice(0, 240) || null,
        request_id: String(event.request_id || "").trim().slice(0, 120) || null,
        before_json: sanitizeAuditValue(event.before),
        after_json: sanitizeAuditValue(event.after),
      }], { returning: false });
      return true;
    } catch (error) {
      console.error("Audit write failed.", { action, code: String(error?.code || "audit_write_failed") });
      return false;
    }
  }

  async listAuditEvents(auth, options = {}) {
    this.requireRole(auth, "admin");
    this.assertConfigured();
    const action = auditFilter(options.action, "action", 120);
    const entityType = auditFilter(options.entity_type, "entity_type", 80);
    const entityId = auditFilter(options.entity_id, "entity_id", 240);
    const limit = Math.min(200, Math.max(1, Number.parseInt(options.limit, 10) || 50));
    const filters = { workspace_id: `eq.${this.workspaceId}` };
    if (action) filters.action = `eq.${action}`;
    if (entityType) filters.entity_type = `eq.${entityType}`;
    if (entityId) filters.entity_id = `eq.${entityId}`;
    const rows = await this.dataProvider.select("audit_events", {
      select: "id,actor_user_id,action,entity_type,entity_id,request_id,before_json,after_json,created_at",
      filters,
      order: "created_at.desc",
      limit,
    });
    return (rows || []).map((row) => ({
      id: row.id,
      actor_user_id: row.actor_user_id || null,
      action: row.action,
      entity_type: row.entity_type || null,
      entity_id: row.entity_id || null,
      request_id: row.request_id || null,
      before: sanitizeAuditValue(row.before_json),
      after: sanitizeAuditValue(row.after_json),
      created_at: row.created_at || null,
    }));
  }

  assertCsrf(req, auth) {
    if (!this.authEnabled || auth?.source !== "cookie") return;
    const cookies = parseCookies(req.headers?.cookie);
    const cookieToken = cookies[this.cookieNames.csrf] || "";
    const headerToken = req.headers?.["x-csrf-token"] || "";
    if (!safeEqual(cookieToken, headerToken)) {
      throw new HttpError(403, "csrf_failed", "请求校验失败，请刷新页面后重试。");
    }
  }

  async sessionStatus(req, res) {
    if (!this.authEnabled) {
      return {
        enabled: false,
        authenticated: true,
        bootstrap_required: false,
        user: { username: "本机管理员", display_name: "本机管理员" },
      };
    }
    this.assertConfigured();
    const bootstrapRequired = await this.isBootstrapRequired();
    let auth = null;
    try {
      auth = await this.authenticateRequest(req, res);
    } catch (error) {
      if (error?.status === 403) throw error;
      this.clearSessionCookies(res);
    }
    const cookies = parseCookies(req.headers?.cookie);
    return {
      enabled: true,
      authenticated: Boolean(auth?.principal),
      bootstrap_required: bootstrapRequired,
      csrf_token: auth?.source === "cookie" ? cookies[this.cookieNames.csrf] || "" : "",
      user: publicUser(auth?.principal),
    };
  }

  async login(body, res) {
    if (!this.authEnabled) throw new HttpError(409, "auth_disabled", "当前配置未启用登录。");
    const { identifier, password } = validateLoginCredentials(body);
    const session = await this.passwordSession(identifier, password);
    const csrfToken = this.setSessionCookies(res, session);
    return {
      authenticated: true,
      csrf_token: csrfToken,
      user: publicUser(session.principal),
    };
  }

  cliSessionPayload(session) {
    return {
      token_type: "bearer",
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: Math.max(60, Number(session.expires_in) || 3600),
      user: publicUser(session.principal),
    };
  }

  async cliLogin(body) {
    if (!this.authEnabled) throw new HttpError(409, "auth_disabled", "当前配置未启用登录。");
    const { identifier, password } = validateLoginCredentials(body);
    return this.cliSessionPayload(await this.passwordSession(identifier, password));
  }

  async cliRefresh(body) {
    if (!this.authEnabled) throw new HttpError(409, "auth_disabled", "当前配置未启用登录。");
    const refreshToken = String(body?.refresh_token || "").trim();
    if (!refreshToken || refreshToken.length > 4096) {
      throw new HttpError(401, "authentication_required", "CLI 登录会话已过期，请重新登录。");
    }
    return this.cliSessionPayload(await this.refreshSession(refreshToken));
  }

  async bootstrap(body, res) {
    if (!this.authEnabled || !this.bootstrapEnabled) {
      throw new HttpError(404, "not_found", "API route was not found.");
    }
    if (this.bootstrapPromise) {
      await this.bootstrapPromise.catch(() => {});
      throw new HttpError(409, "bootstrap_completed", "本机管理员已经创建，请直接登录。");
    }
    this.bootstrapPromise = this.bootstrapAccount(body, res);
    try {
      return await this.bootstrapPromise;
    } finally {
      this.bootstrapPromise = null;
    }
  }

  async bootstrapAccount(body, res) {
    this.assertConfigured();
    if (!(await this.isBootstrapRequired())) {
      throw new HttpError(409, "bootstrap_completed", "本机管理员已经创建，请直接登录。");
    }
    const username = validateUsername(body?.username || body?.display_name);
    const password = validatePassword(body?.password);
    const email = internalOwnerEmail(this.workspaceId);
    const created = await this.authRequest("admin/users", {
      method: "POST",
      body: {
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: username, username },
      },
    });
    const user = created.user || created;
    if (!user?.id) throw new HttpError(502, "auth_provider_error", "身份服务没有返回有效账号。");
    try {
      await this.dataProvider.upsert("app_users", [{ id: user.id, display_name: username }], { onConflict: "id" });
      await this.dataProvider.upsert("app_workspace_members", [{
        workspace_id: this.workspaceId,
        user_id: user.id,
        role: "owner",
      }], { onConflict: "workspace_id,user_id" });
      await this.dataProvider.update("app_workspaces", { created_by: user.id }, {
        id: `eq.${this.workspaceId}`,
        created_by: "is.null",
      }, { returning: false });
    } catch (error) {
      await this.authRequest(`admin/users/${encodeURIComponent(user.id)}`, { method: "DELETE" }).catch(() => {});
      throw new HttpError(502, "bootstrap_persistence_failed", "个人账号未能写入工作区，已撤销本次创建。", {
        provider_code: String(error?.code || "persistence_failed").slice(0, 80),
      });
    }
    const session = await this.passwordSessionByEmail(email, password);
    const csrfToken = this.setSessionCookies(res, session);
    return {
      authenticated: true,
      csrf_token: csrfToken,
      user: publicUser(session.principal),
    };
  }

  async refresh(req, res) {
    if (!this.authEnabled) throw new HttpError(409, "auth_disabled", "当前配置未启用登录。");
    const cookies = parseCookies(req.headers?.cookie);
    const session = await this.refreshSession(cookies[this.cookieNames.refresh]);
    const csrfToken = this.setSessionCookies(res, session, cookies[this.cookieNames.csrf] || undefined);
    return { authenticated: true, csrf_token: csrfToken, user: publicUser(session.principal) };
  }

  async logout(req, res) {
    const cookies = parseCookies(req.headers?.cookie);
    const accessToken = cookies[this.cookieNames.access] || "";
    if (this.authEnabled && accessToken) {
      await this.authRequest("logout?scope=local", { method: "POST", accessToken }).catch(() => {});
      this.cache.delete(tokenHash(accessToken));
    }
    this.clearSessionCookies(res);
    return { authenticated: false };
  }
}

export function createAuthService(options = {}) {
  return new AuthService(options);
}

export { ROLE_LEVEL, parseCookies, serializeCookie };
