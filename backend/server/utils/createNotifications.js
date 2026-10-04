// src/utils/createNotifications.js
import { Notification } from "../../DB/models/user/notification.model.js";
import { User } from "../../DB/models/user/user.model.js";
import { sendEmail } from "./emailService.js";
import { NOTIFICATION_HTML_AR } from "./HTML/notification.ar.html.js";
import { NOTIFICATION_HTML_EN } from "./HTML/notification.en.html.js";

// Helpers
const normalizeEmails = (emails) => {
  if (!Array.isArray(emails)) {
    return [];
  }

  return [
    ...new Set(
      emails
        .filter((email) => typeof email === "string")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
    )
  ];
};

const normalizeLanguage = (language) => {
  return String(language).toLowerCase() === "ar" ? "ar" : "en";
};

const getEmailTemplate = ({ language, title_AR, message_AR, title_EN, message_EN, action_url, image_url }) => {
  if (language === "en") {
    return NOTIFICATION_HTML_EN({ title_EN, message_EN, action_url, image_url });
  }

  return NOTIFICATION_HTML_AR({ title_AR, message_AR, action_url, image_url });
};

// Create Notifications
export const createNotification = async (emails, title_AR, message_AR, title_EN = null, message_EN = null, action_url = null, image_url = null, language = "en") => {
  // Validate Emails
  const normalizedEmails = normalizeEmails(emails);
  if (!normalizedEmails.length) {
    console.warn("[CREATE_NOTIFICATION] No valid emails provided. Skipping notification.");
    return [];
  }
  // Language
  const normalizedLanguage = normalizeLanguage(language);

  // Find Registered Users
  const users = await User.findAll({ where: { email: normalizedEmails }, attributes: ["id", "email"] });

  if (!users.length) {
    console.warn("[CREATE_NOTIFICATION] No registered users found for provided emails.");
    return [];
  }

  // Detect Missing Emails
  const foundEmails = new Set(users.map((user) => String(user.email).trim().toLowerCase()));
  const missingEmails = normalizedEmails.filter((email) => !foundEmails.has(email));

  if (missingEmails.length) {
    console.warn("[CREATE_NOTIFICATION] Emails not found in database:", missingEmails);
  }

  // Create In-App Notifications
  const notificationsData = users.map((user) => ({
    title_AR,
    message_AR,
    title_EN,
    message_EN,
    action_url,
    image_url,

    // Sequelize default foreign key
    userId: user.id
  }));

  const notifications = await Notification.bulkCreate(notificationsData);

  console.log(`[CREATE_NOTIFICATION] Created ${notifications.length} in-app notifications.`);

  // Build Email
  const emailHTML = getEmailTemplate({ language: normalizedLanguage, title_AR, message_AR, title_EN, message_EN, action_url, image_url });

  // Send Emails
  const emailResults = await Promise.allSettled(users.map((user) => sendEmail(user.email, emailHTML)));

  let successfulEmails = 0;
  let failedEmails = 0;

  emailResults.forEach((result, index) => {
    const email = users[index].email;

    if (result.status === "fulfilled") {
      successfulEmails++;
      return;
    }

    failedEmails++;

    console.error(`[CREATE_NOTIFICATION] Failed to send email to ${email}:`, result.reason);
  });

  console.log(`[CREATE_NOTIFICATION] Emails: ${successfulEmails} sent, ${failedEmails} failed.`);

  return notifications;
};
