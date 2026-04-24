/**
 * @fileoverview Local auth and workspace context for API routes.
 */

export type ZeroreRole = "owner" | "admin" | "member" | "viewer";

export type ZeroreRequestContext = {
  userId: string;
  workspaceId: string;
  role: ZeroreRole;
};

const DEFAULT_DEV_CONTEXT: ZeroreRequestContext = {
  userId: "dev-user",
  workspaceId: "default",
  role: "owner",
};

const ROLE_ORDER: Record<ZeroreRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

/**
 * Resolve a request context from headers. The MVP uses a dev fallback so local
 * demos remain one-command runnable; production can replace this with SSO/JWT.
 *
 * @param request Incoming request.
 * @returns Request context.
 */
export function getZeroreRequestContext(request: Request): ZeroreRequestContext {
  const userId = request.headers.get("x-zerore-user-id")?.trim() || DEFAULT_DEV_CONTEXT.userId;
  const workspaceId = sanitizeContextId(
    request.headers.get("x-zerore-workspace-id")?.trim() || DEFAULT_DEV_CONTEXT.workspaceId,
  );
  const role = parseRole(request.headers.get("x-zerore-role")?.trim()) ?? DEFAULT_DEV_CONTEXT.role;
  return { userId, workspaceId, role };
}

/**
 * Assert that a context has at least the required role.
 *
 * @param context Current request context.
 * @param minRole Minimum required role.
 */
export function assertWorkspaceRole(context: ZeroreRequestContext, minRole: ZeroreRole): void {
  if (ROLE_ORDER[context.role] < ROLE_ORDER[minRole]) {
    throw new Error(`权限不足：需要 ${minRole}，当前为 ${context.role}。`);
  }
}

/**
 * Sanitize workspace/user identifiers for local storage paths.
 *
 * @param value Raw identifier.
 * @returns Safe identifier.
 */
export function sanitizeContextId(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "default";
}

/**
 * Parse a role header.
 *
 * @param value Raw role.
 * @returns Role when valid.
 */
function parseRole(value: string | null | undefined): ZeroreRole | null {
  if (value === "owner" || value === "admin" || value === "member" || value === "viewer") {
    return value;
  }
  return null;
}
