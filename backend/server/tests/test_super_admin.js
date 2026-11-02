// backend/server/tests/test_super_admin.js
import dotenv from "dotenv";
dotenv.config({ path: "./backend/.env" });

import { models } from "../db/index.js";
import { verifyPassword } from "../utils/password.js";

const { User, AdminAuditLog } = models;

async function runTest() {
  console.log("==================================================");
  console.log("TESTING SUPER ADMIN SYSTEM BACKEND");
  console.log("==================================================");

  const adminEmail = (process.env.ADMIN_EMAIL || "admin@mafia.local").toLowerCase();
  const admin = await User.findOne({ where: { email: adminEmail } });

  if (!admin) {
    throw new Error(`Admin user ${adminEmail} not found!`);
  }

  console.log(`✓ Admin user found: ${admin.email}`);
  console.log(`✓ Admin role: ${admin.role}`);

  if (admin.role !== "SUPER_ADMIN") {
    throw new Error(`Expected role SUPER_ADMIN, got ${admin.role}`);
  }

  const isPasswordValid = verifyPassword(
    process.env.ADMIN_PASSWORD || "ChangeThisImmediately",
    admin.password
  );

  console.log(`✓ Admin password verification: ${isPasswordValid ? "PASSED" : "FAILED"}`);
  if (!isPasswordValid) throw new Error("Password does not match!");

  // Verify Audit Log table exists and can be queried
  const logCount = await AdminAuditLog.count();
  console.log(`✓ AdminAuditLog table responsive. Total records: ${logCount}`);

  console.log("==================================================");
  console.log("🎉 ALL SUPER ADMIN BACKEND CHECKS PASSED!");
  console.log("==================================================");
  process.exit(0);
}

runTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
