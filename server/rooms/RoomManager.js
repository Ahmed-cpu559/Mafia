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
      code = Math.floor(1000 + Math.random() * 9000).toString();
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

  removeSession(sessionToken) {
    this.sessions.delete(sessionToken);
  }

  removeSessionByPlayerId(playerId) {
    for (const [token, sess] of this.sessions.entries()) {
      if (sess.playerId === playerId) {
        this.sessions.delete(token);
      }
    }
  }
}

export const roomManager = new RoomManager();
