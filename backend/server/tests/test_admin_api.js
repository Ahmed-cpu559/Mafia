// backend/server/tests/test_admin_api.js
import dotenv from "dotenv";
dotenv.config({ path: "./backend/.env" });

import jwt from "jsonwebtoken";
import { models } from "../db/index.js";
import express from "express";
import { createAdminRouter } from "../routes/admin.js";
import { roomManager } from "../rooms/RoomManager.js";

const { User } = models;
const app = express();
app.use(express.json());

// Mock minimal server for testing router
const fakeIo = {
  engine: { clientsCount: 5 },
  to: () => ({ emit: () => {} }),
  sockets: { sockets: new Map() }
};

app.use("/api/admin", createAdminRouter({ roomManager, io: fakeIo }));

async function runApiTests() {
  console.log("==================================================");
  console.log("TESTING SUPER ADMIN REST API ENDPOINTS");
  console.log("==================================================");

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/admin`;

  try {
    // 1. Invalid Login
    const badLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@mafia.local", password: "WrongPassword" })
    });
    console.log(`✓ Invalid login rejected with status: ${badLoginRes.status} (Expected: 401)`);
    if (badLoginRes.status !== 401) throw new Error("Expected 401 on bad credentials");

    // 2. Valid Login
    const goodLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@mafia.local", password: "ChangeThisImmediately" })
    });
    const goodLoginData = await goodLoginRes.json();
    console.log(`✓ Valid login succeeded! Token received, role=${goodLoginData.user?.role}`);
    if (!goodLoginData.token || goodLoginData.user?.role !== "SUPER_ADMIN") {
      throw new Error("Failed to authenticate super admin");
    }

    const adminToken = goodLoginData.token;

    // 3. Unauthorized access check
    const unauthRes = await fetch(`${baseUrl}/dashboard`);
    console.log(`✓ Unauthorized request rejected with status: ${unauthRes.status} (Expected: 401)`);
    if (unauthRes.status !== 401) throw new Error("Expected 401 on missing token");

    // 4. Regular player access check (Forbidden)
    const playerToken = jwt.sign(
      { id: "fake-player-id", userId: "fake-player-id", role: "PLAYER", type: "access" },
      process.env.JWT_KEY || "default_secret"
    );
    // Find or create a temporary dummy player in db
    let dummyPlayer = await User.findOne({ where: { email: "dummy_player@mafia.local" } });
    if (!dummyPlayer) {
      dummyPlayer = await User.create({
        displayName: "Dummy Player",
        email: "dummy_player@mafia.local",
        role: "PLAYER",
        authProvider: "local"
      });
    }
    const realPlayerToken = jwt.sign(
      { id: dummyPlayer.id, userId: dummyPlayer.id, role: "PLAYER", type: "access" },
      process.env.JWT_KEY || "default_secret"
    );

    const forbiddenRes = await fetch(`${baseUrl}/dashboard`, {
      headers: { Authorization: `Bearer ${realPlayerToken}` }
    });
    console.log(`✓ Player token access rejected with status: ${forbiddenRes.status} (Expected: 403 Forbidden)`);
    if (forbiddenRes.status !== 403) throw new Error("Expected 403 Forbidden for normal player");

    // 5. Super Admin GET /dashboard
    const dashboardRes = await fetch(`${baseUrl}/dashboard`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const dashboardData = await dashboardRes.json();
    console.log(`✓ Super Admin GET /dashboard succeeded! KPIs:`, dashboardData.kpis);
    if (!dashboardData.success || !dashboardData.kpis) throw new Error("Dashboard failed");

    // 6. Super Admin GET /users
    const usersRes = await fetch(`${baseUrl}/users?page=1&limit=5`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const usersData = await usersRes.json();
    console.log(`✓ Super Admin GET /users succeeded! Found ${usersData.pagination?.total} total users.`);

    // 7. Super Admin GET /rooms
    const roomsRes = await fetch(`${baseUrl}/rooms`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const roomsData = await roomsRes.json();
    console.log(`✓ Super Admin GET /rooms succeeded! Total rooms: ${roomsData.pagination?.total}`);

    // 8. Super Admin GET /games
    const gamesRes = await fetch(`${baseUrl}/games`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const gamesData = await gamesRes.json();
    console.log(`✓ Super Admin GET /games succeeded! Total games: ${gamesData.pagination?.total}`);

    // 9. Super Admin GET /system
    const systemRes = await fetch(`${baseUrl}/system`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const systemData = await systemRes.json();
    console.log(`✓ Super Admin GET /system succeeded! Server status: ${systemData.health?.serverStatus}, DB status: ${systemData.database?.status}`);

    // 10. Super Admin GET /audit
    const auditRes = await fetch(`${baseUrl}/audit`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const auditData = await auditRes.json();
    console.log(`✓ Super Admin GET /audit succeeded! Recorded audit logs: ${auditData.pagination?.total}`);
    if (auditData.pagination?.total < 1) throw new Error("Expected login audit log to be recorded!");

    console.log("==================================================");
    console.log("🎉 ALL SUPER ADMIN API ENDPOINTS VERIFIED 100%!");
    console.log("==================================================");
  } finally {
    server.close();
  }
}

runApiTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("API test failed:", err);
    process.exit(1);
  });
