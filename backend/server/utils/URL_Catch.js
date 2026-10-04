// src/utils/URL_Catch.js
export const URL_Error = (req, res) => {
  const user = req.user ? `User:${req.user.id || "-"}` : "User:Guest";

  console.warn(`[404] ${req.method} ${req.originalUrl} | ` + `ID:${req.id || req.requestId || "-"} | ` + `${user}`);

  // prettier-ignore
  return res.status(404).json({
    success: false,
    message_EN: "Route not found",
    message_AR: "المسار المطلوب غير موجود",
    message: "المسار المطلوب غير موجود",
    data: null,
  });
};
