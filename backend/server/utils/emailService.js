// src/utils/emailService.js
import nodemailer from "nodemailer";

// CONFIGURATION
const EMAIL_SERVICE = process.env.EMAIL_SERVICE;
const EMAIL_PORT = Number.parseInt(process.env.EMAIL_PORT, 10) || 587;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD;

const DEFAULT_SUBJECT = "message from ciss";

// TRANSPORTER
const transporter = nodemailer.createTransport({
  service: EMAIL_SERVICE,
  port: EMAIL_PORT,

  auth: { user: EMAIL_USER, pass: EMAIL_PASSWORD }
});

// SEND EMAIL
export const sendEmail = async (to, html, subject = DEFAULT_SUBJECT) => {
  if (!to || typeof to !== "string") {
    console.warn("[SEND_EMAIL] Invalid recipient email.");

    return { success: false, sent: false, error: "Invalid recipient email." };
  }

  if (!html || typeof html !== "string") {
    console.warn("[SEND_EMAIL] Invalid email HTML.");

    return { success: false, sent: false, error: "Invalid email HTML." };
  }

  try {
    const info = await transporter.sendMail({ from: `"ciss" <${EMAIL_USER}>`, to: to.trim(), subject: subject || DEFAULT_SUBJECT, html });

    console.log(`[SEND_EMAIL] Email sent successfully to: ${to}`);

    return { success: true, sent: true, messageId: info.messageId, response: info.response };
  } catch (error) {
    console.error("[SEND_EMAIL] Failed to send email:", { to, error: error?.message });

    // Email failure should not crash the request.
    return { success: false, sent: false, error: error?.message || "Failed to send email." };
  }
};
