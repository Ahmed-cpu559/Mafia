// backend/server/rooms/RoomManager.js
import { randomBytes } from "crypto";
import { MafiaGame } from "../engine/MafiaGame.js";

class RoomManager {
  constructor() {
    this.games = new Map(); // roomCode -> MafiaGame instance
    this.sessions = new Map(); // sessionToken -> { roomCode, playerId }
  }

  generateRoomCode() {
    let code;
    do {
      code = Math.floor(10000 + Math.random() * 90000).toString();
    } while (this.games.has(code));
    return code;
  }

  generateSessionToken() {
    return randomBytes(24).toString("hex");
  }

  generateInviteToken() {
    return randomBytes(16).toString("hex");
  }

  createGame(options = {}) {
    const code = this.generateRoomCode();
    const game = new MafiaGame();
    game.code = code;
    game.visibility = options.visibility || "PUBLIC";
    game.inviteToken = options.inviteToken || (game.visibility !== "PUBLIC" ? this.generateInviteToken() : null);
    game.createdAt = Date.now();
    game.rules = options.rules || null;
    this.games.set(code, game);
    return game;
  }

  getGame(code) {
    return this.games.get(code);
  }

  removeGame(code) {
    const game = this.games.get(code);
    if (game && typeof game.destroy === "function") {
      game.destroy();
    }
    this.games.delete(code);
  }

  getPublicRooms() {
    const publicRooms = [];
    for (const [code, game] of this.games.entries()) {
      const visibility = String(game.visibility || "").toUpperCase();
      const phase = String(game.phase || "").toUpperCase();
      if (visibility === "PUBLIC" && (phase === "LOBBY" || phase === "WAITING")) {
        const players = Array.isArray(game.players) ? game.players : [];
        if (players.length > 0) {
          const moderator = players.find(p => p.id === (game.moderatorId || game.sageId || game.ownerId)) || players[0];
          publicRooms.push({
            code,
            roomCode: code,
            visibility: "PUBLIC",
            status: game.phase || "LOBBY",
            phase: game.phase || "LOBBY",
            playerCount: players.length,
            playersCount: players.length,
            maxPlayers: Number(game.rules?.maxPlayers || game.maxPlayers || game.config?.maxPlayers || 20),
            moderatorName: moderator?.name || moderator?.displayName || "Host",
            createdAt: game.createdAt || Date.now(),
          });
        }
      }
    }
    return publicRooms;
  }

  registerSession(sessionToken, roomCode, playerId) {
    this.sessions.set(sessionToken, { roomCode, playerId });
  }

  getSession(sessionToken) {
    return this.sessions.get(sessionToken);
  }
}

export const roomManager = new RoomManager();
