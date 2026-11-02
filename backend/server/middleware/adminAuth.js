// backend/server/middleware/adminAuth.js
import jwt from "jsonwebtoken";
import { models } from "../db/index.js";

const { User, AdminAuditLog } = models;

const JWT_SECRET = process.env.JWT_KEY || "default_secret";

/**
 * Extract token from request (Authorization header, query param, or cookie)
 */
function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && typeof authHeader === "string") {
    const [scheme, token] = authHeader.split(" ");
    if (scheme?.toLowerCase() === "bearer" && token) {
      return token.trim();
    }
  }

  if (req.query?.token) {
    return String(req.query.token).trim();
  }

  if (req.cookies?.mafia_token) {
    return String(req.cookies.mafia_token).trim();
  }

  return null;
}

/**
 * Authentication middleware
 */
export async function requireAuth(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({
        success: false,
        code: "ADMIN_UNAUTHORIZED",
        error: "Authentication token is missing"
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.id ?? decoded.userId ?? decoded.sub;

    if (!userId) {
      return res.status(401).json({
        success: false,
        code: "INVALID_TOKEN",
        error: "Token payload missing user identifier"
      });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        code: "USER_NOT_FOUND",
        error: "User associated with token does not exist"
      });
    }

    if (user.isBlocked) {
      return res.status(403).json({
        success: false,
        code: "USER_BLOCKED",
        error: "Account has been suspended by an administrator"
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      code: "AUTHENTICATION_FAILED",
      error: error.name === "TokenExpiredError" ? "Token has expired" : "Invalid authentication token"
    });
  }
}

/**
 * Super Admin Authorization Middleware
 * Strictly validates server-side role === 'SUPER_ADMIN'
 */
export async function requireSuperAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      code: "ADMIN_UNAUTHORIZED",
      error: "Authentication required"
    });
  }

  if (req.user.role !== "SUPER_ADMIN") {
    return res.status(403).json({
      success: false,
      code: "ADMIN_FORBIDDEN",
      error: "Forbidden: Super Admin access is required"
    });
  }

  next();
}

/**
 * Helper to record administrative actions into AdminAuditLog
 * Never logs passwords or secrets
 */
export async function logAdminAction({
  adminUser,
  action,
  targetType = null,
  targetId = null,
  details = null,
  req = null,
  status = "SUCCESS"
}) {
  try {
    const sanitizedDetails = details ? { ...details } : {};
    // Ensure sensitive keys are stripped
    const SENSITIVE_KEYS = ["password", "token", "refreshToken", "secret", "jwt", "apiKey"];
    for (const key of Object.keys(sanitizedDetails)) {
      if (SENSITIVE_KEYS.some((s) => key.toLowerCase().includes(s))) {
        delete sanitizedDetails[key];
      }
    }

    let ipAddress = null;
    let userAgent = null;

    if (req) {
      ipAddress = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || null;
      userAgent = req.headers["user-agent"] || null;
    }

    await AdminAuditLog.create({
      adminUserId: adminUser?.id || null,
      adminEmail: adminUser?.email || "system",
      action: String(action).toUpperCase(),
      targetType: targetType ? String(targetType).toUpperCase() : null,
      targetId: targetId ? String(targetId) : null,
      details: sanitizedDetails,
      ipAddress,
      userAgent,
      status
    });
  } catch (err) {
    console.error("[AUDIT_LOG_ERROR] Failed to record audit log:", err.message);
  }
}
