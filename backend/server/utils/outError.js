// src/utils/outError.js
import rateLimit from "express-rate-limit";

// Process Errors
const logProcessError = (type, error) => {
  console.error("==================================================");
  console.error(`[PROCESS][${type}]`);
  console.error("Timestamp:", new Date().toISOString());
  console.error("Name:", error?.name || "UnknownError");
  console.error("Message:", error?.message || "Unknown error");

  if (error?.stack) {
    console.error("Stack:", error.stack);
  }
  console.error("==================================================");
};

const shutdownProcess = () => {
  setTimeout(() => {
    process.exit(1);
  }, 100);
};

// Uncaught Exception
export const handleErrorCode = (error) => {
  logProcessError("UNCAUGHT_EXCEPTION", error);

  shutdownProcess();
};

// Unhandled Rejection
export const handleRuntimeError = (reason) => {
  const error = reason instanceof Error ? reason : { name: "UnhandledRejection", message: String(reason) };

  logProcessError("UNHANDLED_REJECTION", error);

  shutdownProcess();
};

// Global Rate Limiter
export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  max: 300,

  standardHeaders: "draft-8",

  legacyHeaders: false,

  passOnStoreError: true,

  handler: (req, res) => {
    console.warn(`[RATE_LIMIT] ${req.method} ${req.originalUrl} | ID:${req.id || req.requestId || "-"} | IP:${req.ip || "-"} | BLOCKED`);

    // prettier-ignore
    return res.status(429).json({
      success: false,
      message:
        "Too many requests, please try again later.",
      message_AR:
        "تم تجاوز عدد الطلبات المسموح بها، يرجى المحاولة مرة أخرى لاحقًا.",
      data: null,
    });
  }
});
