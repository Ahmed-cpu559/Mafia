// backend/server/routes/rooms.js
import { Router } from "express";

export function createRoomsRouter({ roomManager }) {
  const router = Router();

  /**
   * GET /api/rooms/public
   * Returns list of currently open public rooms.
   */
  router.get("/public", (_req, res) => {
    try {
      const rooms = typeof roomManager?.getPublicRooms === "function"
        ? roomManager.getPublicRooms()
        : [];

      return res.status(200).json({
        success: true,
        rooms
      });
    } catch (error) {
      console.error("[ROOMS][GET_PUBLIC_ERROR]", error);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch public rooms",
        rooms: []
      });
    }
  });

  /**
   * GET /api/rooms
   * Returns list of currently open rooms.
   */
  router.get("/", (_req, res) => {
    try {
      const rooms = typeof roomManager?.getPublicRooms === "function"
        ? roomManager.getPublicRooms()
        : [];

      return res.status(200).json({
        success: true,
        rooms
      });
    } catch (error) {
      console.error("[ROOMS][GET_ALL_ERROR]", error);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch rooms",
        rooms: []
      });
    }
  });

  /**
   * GET /api/rooms/:code
   * Check if a room exists and return its basic details.
   */
  router.get("/:code", (req, res) => {
    try {
      const code = String(req.params.code || "").trim().toUpperCase();
      const game = roomManager?.getGame?.(code);
      if (!game) {
        return res.status(404).json({ success: false, error: "Room not found" });
      }

      const players = Array.isArray(game.players) ? game.players : [];
      const moderator = players.find((p) => p.id === (game.moderatorId || game.sageId || game.ownerId)) || players[0];

      return res.status(200).json({
        success: true,
        room: {
          code: game.code,
          roomCode: game.code,
          visibility: game.visibility || "PUBLIC",
          status: game.phase || "LOBBY",
          phase: game.phase || "LOBBY",
          playerCount: players.length,
          playersCount: players.length,
          maxPlayers: Number(game.rules?.maxPlayers || game.maxPlayers || game.config?.maxPlayers || 20),
          moderatorName: moderator?.name || moderator?.displayName || "Host",
          createdAt: game.createdAt || Date.now()
        }
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

export default createRoomsRouter;
