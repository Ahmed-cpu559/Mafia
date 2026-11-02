// backend/server/tests/test_public_rooms.js
import express from "express";
import { roomManager } from "../rooms/RoomManager.js";
import { createRoomsRouter } from "../routes/rooms.js";

async function testPublicRooms() {
  console.log("==================================================");
  console.log("TESTING PUBLIC ROOMS API & DISCOVERY");
  console.log("==================================================");

  // 1. Initial state: No rooms
  const initialRooms = roomManager.getPublicRooms();
  console.log(`Initial public rooms count: ${initialRooms.length} (Expected: 0)`);
  if (initialRooms.length !== 0) throw new Error("Expected 0 initial rooms");

  // 2. Create a PUBLIC game
  const publicGame = roomManager.createGame({ visibility: "PUBLIC" });
  // Add a player
  const host = publicGame.addPlayer("HostUser", "user-1");
  publicGame.moderatorId = host.id;
  publicGame.sageId = host.id;

  // 3. Create a PRIVATE game (should not appear in public rooms)
  const privateGame = roomManager.createGame({ visibility: "PRIVATE" });
  const privHost = privateGame.addPlayer("PrivUser", "user-2");
  privateGame.moderatorId = privHost.id;

  // 4. Create an empty public game with no players (should not appear)
  const emptyGame = roomManager.createGame({ visibility: "PUBLIC" });

  // 5. Test RoomManager.getPublicRooms()
  const publicRooms = roomManager.getPublicRooms();
  console.log(`Public rooms found: ${publicRooms.length} (Expected: 1)`);
  if (publicRooms.length !== 1) {
    throw new Error(`Expected 1 public room, got ${publicRooms.length}`);
  }

  const room = publicRooms[0];
  console.log("Public room item:", room);
  if (room.code !== publicGame.code) throw new Error("Room code mismatch");
  if (room.status !== "LOBBY") throw new Error("Status should be LOBBY");
  if (room.phase !== "LOBBY") throw new Error("Phase should be LOBBY");
  if (room.playerCount !== 1) throw new Error("playerCount should be 1");
  if (room.moderatorName !== "HostUser") throw new Error("moderatorName should be HostUser");

  // 6. Test Express Router
  const app = express();
  app.use(express.json());
  app.use("/api/rooms", createRoomsRouter({ roomManager }));

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/rooms`;

  try {
    const res = await fetch(`${baseUrl}/public`);
    if (!res.ok) throw new Error(`HTTP fetch failed with status ${res.status}`);
    const data = await res.json();
    console.log("GET /api/rooms/public response:", data);

    if (!data.success) throw new Error("Response success should be true");
    if (!Array.isArray(data.rooms) || data.rooms.length !== 1) {
      throw new Error(`Expected 1 room in response, got ${data.rooms?.length}`);
    }

    // 7. Test GET /api/rooms/:code
    const detailRes = await fetch(`${baseUrl}/${publicGame.code}`);
    const detailData = await detailRes.json();
    console.log(`GET /api/rooms/${publicGame.code} response:`, detailData);
    if (!detailData.success || detailData.room.code !== publicGame.code) {
      throw new Error("Room details mismatch");
    }

    // 8. Transition game to PLAYING phase (should drop from public rooms)
    publicGame.phase = "ROLE_ASSIGNMENT";
    const activeRooms = roomManager.getPublicRooms();
    console.log(`Rooms after game started: ${activeRooms.length} (Expected: 0)`);
    if (activeRooms.length !== 0) {
      throw new Error("Game in progress should not be listed in public rooms");
    }

    console.log("==================================================");
    console.log("🎉 ALL PUBLIC ROOMS TESTS PASSED SUCCESSFULLY!");
    console.log("==================================================");
  } finally {
    // Cleanup
    roomManager.removeGame(publicGame.code);
    roomManager.removeGame(privateGame.code);
    roomManager.removeGame(emptyGame.code);
    server.close();
  }
}

testPublicRooms()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  });
