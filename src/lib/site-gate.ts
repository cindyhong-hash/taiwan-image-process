import { createHash, timingSafeEqual } from "node:crypto";

export const SITE_GATE_COOKIE_NAME = "site_gate";

export function createSiteGateToken(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

function safeEqual(left: string, right: string): boolean {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function cookieValue(cookieHeader: string | null, name: string): string | undefined {
  for (const part of (cookieHeader ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function verifySitePassword(candidate: string, password: string): boolean {
  return safeEqual(candidate, password);
}

export function verifySiteGateCookie(cookieHeader: string | null, password: string): boolean {
  const supplied = cookieValue(cookieHeader, SITE_GATE_COOKIE_NAME);
  return !!supplied && safeEqual(supplied, createSiteGateToken(password));
}

export type PaidRequestAuthorization =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string };

export function authorizePaidRequest(
  request: Pick<Request, "headers">,
  environment: { nodeEnv?: string; sitePassword?: string } = {
    nodeEnv: process.env.NODE_ENV,
    sitePassword: process.env.SITE_PASSWORD,
  },
): PaidRequestAuthorization {
  const password = environment.sitePassword;
  if (!password) {
    return environment.nodeEnv === "production"
      ? { ok: false, status: 503, error: "付費功能尚未完成安全設定。" }
      : { ok: true };
  }
  return verifySiteGateCookie(request.headers.get("cookie"), password)
    ? { ok: true }
    : { ok: false, status: 401, error: "請先輸入網站管理密碼。" };
}

export type PaidRouteExecution = { invocationStartedAt: number };

export function protectPaidRoute<Context>(
  handler: (request: Request, context: Context, execution: PaidRouteExecution) => Promise<Response>,
  dependencies: {
    authorizationEnvironment?: { nodeEnv?: string; sitePassword?: string };
    now?: () => number;
  } = {},
): (request: Request, context: Context) => Promise<Response> {
  return async (request, context) => {
    const invocationStartedAt = (dependencies.now ?? Date.now)();
    const authorization = dependencies.authorizationEnvironment
      ? authorizePaidRequest(request, dependencies.authorizationEnvironment)
      : authorizePaidRequest(request);
    if (!authorization.ok) {
      return Response.json({ error: authorization.error }, { status: authorization.status });
    }
    return handler(request, context, { invocationStartedAt });
  };
}
