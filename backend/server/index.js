import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { roomManager } from './rooms/RoomManager.js';
import { GamePhase, ChatChannel } from '../shared/enums.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { GlobalError } from './utils/globalError.js';
import { URL_Error } from './utils/URL_Catch.js';
import { handleErrorCode, handleRuntimeError, globalRateLimiter } from './utils/outError.js';

// Handle uncaught exceptions and unhandled rejections globally
process.on('uncaughtException', handleErrorCode);
process.on('unhandledRejection', handleRuntimeError);

const app = express();
const httpServer = createServer(app);

// In a real production app, configure CORS appropriately.
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(globalRateLimiter);
app.use(express.json());

// API endpoints (if needed for initial config before socket connection)
// Mostly handled via sockets though.

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Create Game
  socket.on('createGame', ({ playerName }, callback) => {
    try {
      const game = roomManager.createGame();
      const sage = game.addPlayer(playerName);
      game.setSage(sage.id);
      
      const sessionToken = roomManager.generateSessionToken();
      roomManager.registerSession(sessionToken, game.code, sage.id);
      
      socket.join(game.code);
      socket.data.sessionToken = sessionToken;
      socket.data.roomCode = game.code;
      socket.data.playerId = sage.id;

      setupGameListeners(game, game.code);
      
      callback({
        success: true,
        roomCode: game.code,
        sessionToken,
        playerId: sage.id,
        isSage: true,
        state: game.getVisibleState(sage.id)
      });
    } catch (e) {
      callback({ success: false, error: e.message });
    }
  });

  // Join Game
  socket.on('joinGame', ({ roomCode, playerName, sessionToken: existingToken }, callback) => {
    try {
      const code = roomCode.toUpperCase();
      const game = roomManager.getGame(code);

      if (!game) {
        return callback({ success: false, error: 'Game not found' });
      }

      let sessionToken = existingToken;
      let player;

      // Reconnection logic
      if (sessionToken) {
        const session = roomManager.getSession(sessionToken);
        if (session && session.roomCode === code) {
          player = game.getPlayer(session.playerId);
        }
      }

      // New join logic
      if (!player) {
        if (game.phase !== GamePhase.LOBBY) {
          return callback({ success: false, error: 'Game already in progress' });
        }
        player = game.addPlayer(playerName);
        sessionToken = roomManager.generateSessionToken();
        roomManager.registerSession(sessionToken, code, player.id);
      }

      socket.join(code);
      socket.data.sessionToken = sessionToken;
      socket.data.roomCode = code;
      socket.data.playerId = player.id;

      // Notify others in lobby if new player
      if (game.onStateChange) game.onStateChange();

      callback({
        success: true,
        roomCode: code,
        sessionToken,
        playerId: player.id,
        isSage: player.id === game.sageId,
        state: game.getVisibleState(player.id)
      });
    } catch (e) {
      callback({ success: false, error: e.message });
    }
  });

  function requireAuth(socket, next) {
    const { roomCode, playerId } = socket.data;
    if (!roomCode || !playerId) {
      if (next) next({ success: false, error: 'Unauthorized' });
      return null;
    }
    const game = roomManager.getGame(roomCode);
    if (!game) {
      if (next) next({ success: false, error: 'Game not found' });
      return null;
    }
    return { game, playerId };
  }

  // Player Actions
  socket.on('playerAction', (action, callback) => {
    const auth = requireAuth(socket, callback);
    if (!auth || !auth.game) return;
    const { game, playerId } = auth;

    try {
      // action = { type: 'KILL', targetIds: [...] }
      const res = game.submitAction(playerId, action.type, action.targetIds);
      if (callback) callback(res);
    } catch (e) {
      if (callback) callback({ success: false, error: e.message });
    }
  });

  socket.on('submitVote', ({ targetId }, callback) => {
    const auth = requireAuth(socket, callback);
    if (!auth || !auth.game) return;
    const { game, playerId } = auth;

    try {
      const res = game.submitVote(playerId, targetId);
      if (callback) callback(res);
    } catch (e) {
      if (callback) callback({ success: false, error: e.message });
    }
  });

  // Chat
  socket.on('sendChat', ({ channel, message }, callback) => {
    const auth = requireAuth(socket, callback);
    if (!auth || !auth.game) return;
    const { game, playerId } = auth;

    try {
      const msgDTO = game.sendChat(playerId, channel, message);
      if (!msgDTO || !msgDTO.success) {
        if (callback) callback(msgDTO || { success: false, error: 'Unauthorized' });
        return;
      }
      
      // Determine who gets the message based on channel
      const sockets = io.sockets.adapter.rooms.get(game.code);
      if (sockets) {
        for (const sid of sockets) {
          const clientSocket = io.sockets.sockets.get(sid);
          if (!clientSocket) continue;
          const cPlayerId = clientSocket.data.playerId;
          // Sage doesn't have a player ID, but should see all chat
          if (cPlayerId === game.sageId || game.canReadChannel(game.getPlayer(cPlayerId), channel)) {
            clientSocket.emit('chatMessage', msgDTO.message);
          }
        }
      }
      if (callback) callback({ success: true });
    } catch (e) {
      if (callback) callback({ success: false, error: e.message });
    }
  });

  // Sage Actions
  socket.on('sageCommand', (command, callback) => {
    const auth = requireAuth(socket, callback);
    if (!auth || !auth.game) return;
    const { game, playerId } = auth;

    if (playerId !== game.sageId) {
      if (callback) callback({ success: false, error: 'Only Sage can run commands' });
      return;
    }

    try {
      if (command.type === 'START_GAME') {
        const payload = command.payload;
        game.gameMode = payload.gameMode;
        
        // Update awareness
        if (payload.config.mafiaAwareness) game.mafiaAwareness = payload.config.mafiaAwareness;
        if (payload.config.doctorAwareness) game.doctorAwareness = payload.config.doctorAwareness;
        if (payload.config.officerAwareness) game.officerAwareness = payload.config.officerAwareness;
        
        // Update default config for timers and counts
        game.updateDefaultConfig({
          mafiaKillCount: payload.config.mafiaKillCount,
          doctorHealCount: payload.config.doctorHealCount,
          mafiaTimerSeconds: payload.config.timers.NIGHT_MAFIA,
          doctorTimerSeconds: payload.config.timers.NIGHT_DOCTOR,
          officerTimerSeconds: payload.config.timers.NIGHT_OFFICER,
          discussionTimerSeconds: payload.config.timers.DISCUSSION,
          votingTimerSeconds: payload.config.timers.VOTING,
        });

        game.assignRoles(payload.roleCounts);
        game.startGame();
      } else if (command.type === 'ADVANCE_PHASE') {
        game.advancePhase();
      } else if (command.type === 'EXTEND_TIMER') {
        game.extendTimer(command.payload.seconds);
      } else if (command.type === 'REVEAL_INVESTIGATION') {
        game.devRevealInvestigation(command.payload.targetId);
      } else if (command.type === 'SET_WINNER') {
        game.devSetWinner(command.payload.team);
      } else if (command.type === 'ANNOUNCE') {
        game.createAnnouncement(command.payload.text);
      } else if (command.type === 'UPDATE_CONFIG') {
        game.updateRoundConfig(command.payload);
      } else if (command.type === 'CANCEL_GAME') {
        game.cancelGame();
      }

      if (callback) callback({ success: true });
    } catch (e) {
      console.error('START_GAME ERROR:', e);
      if (callback) callback({ success: false, error: e.message || e.toString() });
    }
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    const { roomCode, playerId } = socket.data;
    if (roomCode && playerId) {
      const game = roomManager.getGame(roomCode);
      if (game) {
        // We could mark player as offline in state here
        // player.isConnected = false;
        // broadcast stateUpdate
      }
    }
  });
});

// Helper to hook engine events to socket broadcasts
function setupGameListeners(game, roomCode) {
  // Only attach once per game
  if (game.onStateChange) return;
  
  game.onStateChange = () => {
    // Whenever game state changes, we need to send the masked state to EACH player individually
    const sockets = io.sockets.adapter.rooms.get(roomCode);
    if (!sockets) return;

    for (const sid of sockets) {
      const clientSocket = io.sockets.sockets.get(sid);
      const playerId = clientSocket.data.playerId;
      const visibleState = game.getVisibleState(playerId);
      clientSocket.emit('stateUpdate', visibleState);
    }
  };
}

const PORT = process.env.PORT || 3000;

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve frontend in production
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

app.use((req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Handle 404s (URLs not caught by other routes)
app.all('*', URL_Error);

// Global Error Handler Middleware
app.use(GlobalError);

httpServer.listen(PORT, () => {
  console.log(`Mafia Server running on port ${PORT}`);
});
