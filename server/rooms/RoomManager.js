import { randomBytes } from 'crypto';
import { MafiaGame } from '../engine/MafiaGame.js';

class RoomManager {
  constructor() {
    this.games = new Map(); // roomCode -> MafiaGame instance
    this.sessions = new Map(); // sessionToken -> { roomCode, playerId }
  }

  generateRoomCode() {
    let code;
    do {
      code = Math.random().toString(36).substring(2, 6).toUpperCase();
    } while (this.games.has(code));
    return code;
  }

  generateSessionToken() {
    return randomBytes(16).toString('hex');
  }

  createGame() {
    const code = this.generateRoomCode();
    const game = new MafiaGame();
    game.code = code;
    this.games.set(code, game);
    return game;
  }

  getGame(code) {
    return this.games.get(code);
  }

  registerSession(sessionToken, roomCode, playerId) {
    this.sessions.set(sessionToken, { roomCode, playerId });
  }

  getSession(sessionToken) {
    return this.sessions.get(sessionToken);
  }
}

export const roomManager = new RoomManager();
