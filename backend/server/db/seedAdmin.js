// backend/server/db/seedAdmin.js
import { fileURLToPath } from "url";
import sequelize, { models } from "./index.js";
import { hashPassword } from "../utils/password.js";

const { User } = models;

export async function seedAdmin() {
  const adminEmail = (process.env.ADMIN_EMAIL || "admin@mafia.local").trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || "ChangeThisImmediately";
  const adminDisplayName = process.env.ADMIN_DISPLAY_NAME || "Super Admin";

  try {
    // Ensure AdminAuditLog table is created if missing
    await models.AdminAuditLog.sync();

    const existing = await User.findOne({ where: { email: adminEmail } });

    if (existing) {
      const updates = {};
      let modified = false;

      if (existing.role !== "SUPER_ADMIN") {
        updates.role = "SUPER_ADMIN";
        modified = true;
      }

      if (existing.isBlocked) {
        updates.isBlocked = false;
        modified = true;
      }

      // If user had no password set, assign it
      if (!existing.password) {
        updates.password = hashPassword(adminPassword);
        modified = true;
      }

      if (modified) {
        await existing.update(updates);
        console.log(`[ADMIN_SEED] Existing user ${adminEmail} upgraded to SUPER_ADMIN.`);
      } else {
        console.log(`[ADMIN_SEED] Super Admin account already exists: ${adminEmail}`);
      }

      return existing;
    }

    // Create new Super Admin account
    const hashedPassword = hashPassword(adminPassword);
    const newAdmin = await User.create({
      displayName: adminDisplayName,
      email: adminEmail,
      password: hashedPassword,
      role: "SUPER_ADMIN",
      authProvider: "local",
      isConfirmed: true,
      isBlocked: false,
      isOnline: false
    });

    console.log(`[ADMIN_SEED] Super Admin created successfully: ${adminEmail}`);
    return newAdmin;
  } catch (error) {
    console.error("[ADMIN_SEED] Failed to seed Super Admin:", error.message);
    throw error;
  }
}

// Support direct CLI execution
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  import("dotenv").then(({ default: dotenv }) => {
    dotenv.config({ path: "./backend/.env" });
    seedAdmin()
      .then(() => process.exit(0))
      .catch((err) => {
        console.error(err);
        process.exit(1);
      });
  });
}
