// src/utils/GlobalError.js
const sanitizeForLog = (obj) => obj;
const slug = (str) => String(str).replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();

const DEFAULT_STATUS_CODE = 500;

const DEFAULT_MESSAGE_EN = "Something went wrong";
const DEFAULT_MESSAGE_AR = "حدث خطأ ما، يرجى المحاولة مرة أخرى";

const INTERNAL_MESSAGE_EN = "Internal server error";
const INTERNAL_MESSAGE_AR = "حدث خطأ داخلي في السيرفر";

const MAX_LOG_VALUE_LENGTH = 300;
const MAX_STACK_LINES = 40;
const INTERNAL_FILES = new Set(["GlobalError.js", "globalError.js"]);
const SEP = "-".repeat(74);

// STATUS CODE
const normalizeStatusCode = (statusCode) => {
  const parsedStatusCode = Number(statusCode);
  if (!Number.isInteger(parsedStatusCode) || parsedStatusCode < 100 || parsedStatusCode > 599) {
    return DEFAULT_STATUS_CODE;
  }
  return parsedStatusCode;
};

// LANGUAGE
const getRequestLanguage = (req) => {
  const langHeader = req?.headers?.lang || req?.headers?.["accept-language"];
  if (!langHeader) return "en";
  const language = String(langHeader).toLowerCase().trim().split(",")[0].split("-")[0].split("_")[0];
  return language === "ar" ? "ar" : "en";
};

// SAFE VALUE
const truncateValue = (value) => {
  if (typeof value !== "string" || value.length <= MAX_LOG_VALUE_LENGTH) return value;
  return `${value.substring(0, MAX_LOG_VALUE_LENGTH)}... (${value.length} chars)`;
};

// OBJECT FORMATTER
const formatObject = (value, emptyMessage) => {
  if (!value || typeof value !== "object" || Object.keys(value).length === 0) return { text: emptyMessage, isEmpty: true };

  try {
    return { text: JSON.stringify(sanitizeForLog(value), (_, childValue) => truncateValue(childValue), 2), isEmpty: false };
  } catch {
    return { text: "[Unable to serialize object]", isEmpty: false };
  }
};

// ERROR DETAILS
const getErrorDetails = (err) => {
  if (!err) return "Unknown error";

  // Sequelize validation / constraint errors
  if (Array.isArray(err.errors)) {
    const details = err.errors
      .map((error) => {
        if (typeof error === "string") {
          return error;
        }

        return error?.message || error?.type || null;
      })
      .filter(Boolean)
      .join(", ");

    return details || err.parent?.sqlMessage || err.original?.sqlMessage || err.message || "Database validation error";
  }

  return err.parent?.sqlMessage || err.original?.sqlMessage || err.message || "Unknown error";
};

// ERROR MESSAGES
const getErrorMessages = (err) => {
  const isOperational = err?.isOperational === true;

  const statusCode = normalizeStatusCode(err?.statusCode);

  // Don't expose internal/unexpected messages
  // in production.
  if (process.env.NODE_ENV === "production" && (!isOperational || statusCode >= 500)) {
    return { message_EN: INTERNAL_MESSAGE_EN, message_AR: INTERNAL_MESSAGE_AR };
  }

  return {
    message_EN: String(err?.message_EN || err?.message || DEFAULT_MESSAGE_EN),

    message_AR: String(err?.message_AR || DEFAULT_MESSAGE_AR)
  };
};

// ERROR SLUG
const getErrorSlug = (err, messageEN) => {
  if (err?.code) {
    return String(err.code)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  if (err?.slug) {
    return String(err.slug).trim().toLowerCase();
  }

  return String(slug(messageEN)).trim().toLowerCase();
};

// STACK PARSER
const parseStackLine = (line) => {
  const match = line?.trim().match(/^at\s+(?:(.*?)\s+\()?((?:file:\/\/\/)?[^()]+?):(\d+):(\d+)\)?$/);

  if (!match) {
    return null;
  }

  return {
    functionName: match[1] || "anonymous",

    file: match[2].replace(/^file:\/\/\//, ""),

    line: Number(match[3]),

    column: Number(match[4]),

    raw: line.trim()
  };
};

// ERROR LOCATION
const getErrorLocation = (err) => {
  const frames = err?.stack?.split("\n").map(parseStackLine).filter(Boolean) || [];

  return (
    frames.find((frame) => {
      const file = frame.file.replaceAll("\\", "/");

      return !file.includes("/node_modules/") && !INTERNAL_FILES.has(file.split("/").pop());
    }) ||
    frames[0] ||
    null
  );
};

// STACK TRACE
const formatStackTrace = (stack) => {
  if (!stack) {
    return null;
  }
  const lines = stack.split("\n");

  if (lines.length <= MAX_STACK_LINES) {
    return stack;
  }
  return [...lines.slice(0, MAX_STACK_LINES), `... ${lines.length - MAX_STACK_LINES} more stack lines`].join("\n");
};

// CLIENT IP
const getClientIp = (req) => {
  return req?.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() || req?.headers?.["x-real-ip"] || req?.socket?.remoteAddress || req?.ip || "-";
};

// REQUEST USER
const getRequestUser = (req) => {
  if (!req?.user) {
    return { name: "-", email: "-", id: "-", role: "-" };
  }

  return {
    name: req.user.fullName || "-",

    email: req.user.email || "-",

    id: req.user.id || "-",

    role: req.user.role || "-"
  };
};

// ERROR TYPE
const isOperationalError = (err) => {
  return err?.isOperational === true;
};

// ERROR RESPONSE
const buildErrorResponse = ({ statusCode, errorSlug, message_EN, message_AR, message, requestId, err }) => {
  const response = {
    success: false,

    error: { statusCode, slug: errorSlug, message_EN, message_AR, message }
  };

  if (requestId && requestId !== "-") {
    response.error.requestId = requestId;
  }

  if (process.env.NODE_ENV !== "production" && err) {
    response.error.debug = {
      name: err.name || "Error",

      isOperational: err.isOperational === true,

      ...(err.code && { code: err.code }),

      ...(err.details !== undefined && { details: err.details }),

      ...(err.meta !== undefined && { meta: err.meta }),

      ...(err.stack && { stack: err.stack })
    };
  }

  return response;
};

// GLOBAL ERROR HANDLER
export const GlobalError = (err, req, res, _next) => {
  req.errorHandled = true;

  // Basic info
  const statusCode = normalizeStatusCode(err?.statusCode);

  const language = getRequestLanguage(req);

  const isOperational = isOperationalError(err);

  const { message_EN, message_AR } = getErrorMessages(err);

  const errorSlug = getErrorSlug(err, message_EN);

  const message = language === "ar" ? message_AR : message_EN;

  const title = err?.name || "ApplicationError";

  const details = getErrorDetails(err);

  const errorLocation = getErrorLocation(err);

  const query = formatObject(req?.query, "No Query");

  const params = formatObject(req?.params, "No Params");

  const body = formatObject(req?.body, "No Body");

  const requestId = req?.id || req?.requestId || req?.headers?.["x-request-id"] || "-";

  const user = getRequestUser(req);

  const timestamp = new Date().toISOString();

  // Logs
  const lines = [];

  const push = (line = "") => lines.push(line);

  const pushSection = (label) => push(`--- ${label} ---`);

  const pushFooter = () => {};

  const locationSummary = errorLocation ? ` @ ${errorLocation.file}:${errorLocation.line}` : "";
  push();
  push(`${statusCode >= 500 ? "💥" : "⚠️"} ${statusCode} ${statusCode >= 500 ? "CRITICAL" : "WARNING"} ${title} → ${message_EN}${locationSummary}`);
  push(SEP);
  push(`Slug       : ${errorSlug}`);
  push(`Status     : ${statusCode}`);
  push(`Operational: ${isOperational}`);
  push(`Language   : ${language}`);
  push(`Details    : ${details}`);
  push(`Message EN : ${message_EN}`);
  push(`Message AR : ${message_AR}`);
  push(`Time       : ${timestamp}`);

  // SOURCE LOCATION
  if (errorLocation) {
    push();
    pushSection("SOURCE LOCATION");
    push(`File     : ${errorLocation.file}`);
    push(`Function : ${errorLocation.functionName}`);
    push(`Line:Col : ${errorLocation.line}:${errorLocation.column}`);
    push(`Frame    : ${errorLocation.raw}`);
    pushFooter();
  }

  // REQUEST
  push();
  pushSection("REQUEST");
  push(`Method     : ${req?.method || "-"}  Route: ${req?.originalUrl || "-"}`);
  push(`IP         : ${getClientIp(req)}   Request ID: ${requestId}`);
  push(`User       : ${user.name} (email: ${user.email}, id: ${user.id}, role: ${user.role})`);
  push(`User Agent : ${req?.headers?.["user-agent"] || "-"}`);
  push(`Language   : ${language}`);
  pushFooter();

  // REQUEST DATA
  if (!query.isEmpty || !params.isEmpty || !body.isEmpty) {
    push();
    pushSection("REQUEST DATA");
    if (!query.isEmpty) push(`Query: ${query.text}`);
    if (!params.isEmpty) push(`Params: ${params.text}`);
    if (!body.isEmpty) push(`Body: ${body.text}`);
    pushFooter();
  }

  // SQL
  const sql = err?.sql || err?.parent?.sql || err?.original?.sql;
  if (sql) {
    push();
    pushSection("SQL");
    push(truncateValue(String(sql)));
    pushFooter();
  }

  // SQL PARAMETERS
  if (err?.parameters && typeof err.parameters === "object") {
    push();
    pushSection("SQL PARAMETERS");
    push(formatObject(err.parameters, "No SQL Parameters").text);
    pushFooter();
  }

  // VALIDATION ERRORS
  if (Array.isArray(err?.errors) && err.errors.length > 0) {
    push();
    pushSection("VALIDATION ERRORS");
    err.errors.forEach((field, index) => {
      const fieldPath = Array.isArray(field?.path) ? field.path.join(".") : field?.path || "-";
      push(`${index + 1}. ${fieldPath}: ${field?.message || "Invalid value"}`);
    });
    pushFooter();
  }

  // CAUSE
  if (err?.cause) {
    push();
    pushSection("ERROR CAUSE");
    push(`Name    : ${err.cause?.name || "-"}`);
    push(`Message : ${err.cause?.message || "-"}`);
    pushFooter();
  }

  // DEVELOPMENT STACK
  if (process.env.NODE_ENV !== "production" && err?.stack) {
    push();
    pushSection("STACK TRACE");
    push(formatStackTrace(err.stack));
    pushFooter();
  }

  // FINAL LOG
  push(SEP);

  if (statusCode >= 500) {
    console.error(lines.join("\n"));
  } else {
    console.warn(lines.join("\n"));
  }

  // HEADERS ALREADY SENT
  if (res.headersSent) return;

  // RESPONSE
  const response = buildErrorResponse({
    statusCode,

    errorSlug,

    message_EN,

    message_AR,

    message,

    requestId,

    err
  });
  // prettier-ignore
  return res.status(statusCode).json(response);
};
