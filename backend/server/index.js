// backend/server/index.js
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment before loading modules that may depend on env values.
dotenv.config({ path: path.join(__dirname, "../.env") });

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import jwt from "jsonwebtoken";
import fs from "fs";
import passport from "passport";

import { roomManager } from "./rooms/RoomManager.js";
import { GlobalError } from "./utils/globalError.js";
import { URL_Error } from "./utils/URL_Catch.js";
import { handleErrorCode, handleRuntimeError, globalRateLimiter } from "./utils/outError.js";

import sequelize, { models } from "./db/index.js";

import authRouter from "./routes/auth.js";
import { createAdminRouter } from "./routes/admin.js";
import { createRoomsRouter } from "./routes/rooms.js";
import { seedAdmin } from "./db/seedAdmin.js";
import "./utils/googleStrategy.js";

import { GamePhase, ChatChannel } from "../../shared/enums.js";

const { User, Room, RoomPlayer, Game, GamePlayer } = models;

/*
|--------------------------------------------------------------------------
| CONFIG
|--------------------------------------------------------------------------
*/

const PORT = Number(process.env.PORT || 3000);

const JWT_SECRET = process.env.JWT_KEY;

const NODE_ENV = process.env.NODE_ENV || "development";

const MIN_PLAYERS = Math.max(5, Number(process.env.MAFIA_MIN_PLAYERS || 5));

const MAX_PLAYERS = Math.max(MIN_PLAYERS, Number(process.env.MAFIA_MAX_PLAYERS || 20));

const FRONTEND_URL = process.env.FRONTEND_URL || "*";

const SOCKET_PING_INTERVAL = 25000;
const SOCKET_PING_TIMEOUT = 20000;

/*
|--------------------------------------------------------------------------
| APP
|--------------------------------------------------------------------------
*/

const app = express();

const httpServer = createServer(app);

app.disable("x-powered-by");

app.set("trust proxy", Number(process.env.TRUST_PROXY || 1));

/*
|--------------------------------------------------------------------------
| CORS
|--------------------------------------------------------------------------
*/

function getAllowedOrigins() {
  return [
    ...FRONTEND_URL.split(","),
    ...(process.env.CORS_ORIGIN || "").split(",")
  ]
    .map((item) => item.trim())
    .filter(Boolean);
}

const allowedOrigins = getAllowedOrigins();

const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Always allow localhost, 127.0.0.1, and private LAN IPs for local/mobile dev
    if (
      origin.includes("localhost") ||
      origin.includes("127.0.0.1") ||
      /^https?:\/\/(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(origin)
    ) {
      return callback(null, true);
    }

    return callback(new Error(`Origin not allowed: ${origin}`));
  },

  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

  credentials: true
};

/*
|--------------------------------------------------------------------------
| SOCKET.IO
|--------------------------------------------------------------------------
*/

const io = new Server(httpServer, {
  cors: corsOptions,

  transports: ["websocket", "polling"],

  pingInterval: SOCKET_PING_INTERVAL,

  pingTimeout: SOCKET_PING_TIMEOUT,

  maxHttpBufferSize: 1024 * 1024
});

/*
|--------------------------------------------------------------------------
| EXPRESS MIDDLEWARE
|--------------------------------------------------------------------------
*/

app.use(cors(corsOptions));

app.use(globalRateLimiter);

app.use(express.json({ limit: "200kb" }));

app.use(express.urlencoded({ extended: true, limit: "100kb" }));

app.use(passport.initialize());

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function log(scope, message, extra = "") {
  const suffix = extra ? ` ${extra}` : "";

  console.log(`[${scope}] ${message}${suffix}`);
}

function logError(scope, message, error) {
  console.error(`[${scope}][ERROR] ${message}`, error?.message || error);
}

function success(data = {}) {
  return { success: true, ...data };
}

function failure(message, code = "BAD_REQUEST") {
  return { success: false, code, error: message instanceof Error ? message.message : String(message || "Something went wrong") };
}

function acknowledge(callback, payload) {
  if (typeof callback === "function") {
    callback(payload);
  }
}

function normalizeRoomCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function normalizeRole(value) {
  const role = String(value || "")
    .trim()
    .toUpperCase();

  const aliases = {
    MAFIA: "MAFIA",

    DOCTOR: "DOCTOR",

    OFFICER: "OFFICER",

    DETECTIVE: "OFFICER",

    POLICE: "OFFICER",

    VILLAGER: "VILLAGER",

    CITIZEN: "VILLAGER"
  };

  return aliases[role] || role;
}

function getTeamForRole(role) {
  return role === "MAFIA" ? "MAFIA" : "VILLAGE";
}

function getSocketToken(socket) {
  const authToken = socket.handshake?.auth?.token;

  if (authToken) {
    return String(authToken);
  }

  const queryToken = socket.handshake?.query?.token;

  if (queryToken) {
    return String(queryToken);
  }

  const authorization = socket.handshake?.headers?.authorization;

  if (authorization) {
    const [scheme, token] = String(authorization).split(" ");

    if (scheme?.toLowerCase() === "bearer" && token) {
      return token;
    }
  }

  return null;
}

function verifyAccessToken(token) {
  if (!JWT_SECRET) {
    throw new Error("JWT_KEY is not configured");
  }

  const decoded = jwt.verify(token, JWT_SECRET);

  if (!decoded || typeof decoded !== "object") {
    throw new Error("Invalid token");
  }

  if (decoded.type && decoded.type !== "access") {
    throw new Error("Only access tokens are allowed");
  }

  const userId = decoded.id ?? decoded.userId ?? decoded.userID ?? decoded.sub;

  if (!userId) {
    throw new Error("User ID missing from token");
  }

  return { ...decoded, userId };
}

/*
|--------------------------------------------------------------------------
| GAME HELPERS
|--------------------------------------------------------------------------
*/

function getPlayers(game) {
  return Array.isArray(game?.players) ? game.players : [];
}

function getGamePlayer(game, playerId) {
  if (!game || !playerId) {
    return null;
  }

  if (typeof game.getPlayer === "function") {
    return game.getPlayer(playerId) || game.getPlayer(String(playerId));
  }

  return getPlayers(game).find((player) => String(player.id) === String(playerId));
}

function getAlivePlayers(game) {
  return getPlayers(game).filter((player) => player.isAlive !== false);
}

function getRoomPlayers(game) {
  return getPlayers(game);
}

function isModerator(game, playerId) {
  return Boolean(
    game &&
      playerId != null &&
      (String(game.moderatorId) === String(playerId) ||
        String(game.ownerId) === String(playerId) ||
        String(game.sageId) === String(playerId))
  );
}

function getVisibleState(game, playerId) {
  if (typeof game?.getVisibleState !== "function") {
    return null;
  }

  return game.getVisibleState(playerId);
}

/*
|--------------------------------------------------------------------------
| ROLE VALIDATION
|--------------------------------------------------------------------------
*/

function validateRole(role) {
  const allowed = new Set(["MAFIA", "DOCTOR", "OFFICER", "VILLAGER"]);

  return allowed.has(role);
}

function validateRoleDistribution(game) {
  const players = getRoomPlayers(game);

  if (players.length < MIN_PLAYERS) {
    return failure(`At least ${MIN_PLAYERS} players are required`, "MIN_PLAYERS_REQUIRED");
  }

  const roleCounts = { MAFIA: 0, DOCTOR: 0, OFFICER: 0, VILLAGER: 0 };

  for (const player of players) {
    const role = normalizeRole(player.role);

    if (!role) {
      return failure(`Player ${player.name || player.id} does not have a role`, "ROLE_NOT_ASSIGNED");
    }

    if (!validateRole(role)) {
      return failure(`Invalid role: ${role}`, "INVALID_ROLE");
    }

    roleCounts[role]++;
  }

  /*
   * Core Mafia rules:
   *
   * 6 players:
   * 2 Mafia
   * 1 Doctor
   * 1 Officer
   * 2 Villagers
   *
   * 7 players:
   * 2 Mafia
   * 1 Doctor
   * 1 Officer
   * 3 Villagers
   *
   * 9 players:
   * 3 Mafia
   * 1 Doctor
   * 1 Officer
   * 4 Villagers
   */

  const minMafia = players.length <= 5 ? 1 : 2;

  if (roleCounts.MAFIA < minMafia) {
    return failure(`At least ${minMafia} Mafia player${minMafia > 1 ? "s are" : " is"} required`, "INVALID_MAFIA_COUNT");
  }

  if (roleCounts.DOCTOR !== 1) {
    return failure("Exactly 1 Doctor is required", "INVALID_DOCTOR_COUNT");
  }

  if (roleCounts.OFFICER !== 1) {
    return failure("Exactly 1 Officer is required", "INVALID_OFFICER_COUNT");
  }

  const maximumMafia = Math.max(minMafia, Math.floor(players.length / 2.5));

  if (roleCounts.MAFIA > maximumMafia) {
    return failure(`For ${players.length} players, maximum Mafia count is ${maximumMafia}`, "MAFIA_COUNT_TOO_HIGH");
  }

  return success({ roleCounts });
}

function assignRole(game, playerId, role) {
  const player = getGamePlayer(game, playerId);

  if (!player) {
    throw new Error("Player not found");
  }

  const normalizedRole = normalizeRole(role);

  if (!validateRole(normalizedRole)) {
    throw new Error(`Invalid role: ${normalizedRole}`);
  }

  player.role = normalizedRole;

  player.team = getTeamForRole(normalizedRole);

  return player;
}

function assignRoles(game, assignments) {
  if (!assignments || typeof assignments !== "object") {
    return failure("roleAssignments must be an object", "INVALID_ROLE_ASSIGNMENTS");
  }

  const players = getRoomPlayers(game);

  const assignedIds = new Set();

  for (const [playerId, role] of Object.entries(assignments)) {
    const player = getGamePlayer(game, playerId);

    if (!player) {
      return failure(`Player ${playerId} not found`, "PLAYER_NOT_FOUND");
    }

    const normalizedRole = normalizeRole(role);

    if (!validateRole(normalizedRole)) {
      return failure(`Invalid role ${role}`, "INVALID_ROLE");
    }

    if (assignedIds.has(String(player.id))) {
      return failure("Duplicate player assignment", "DUPLICATE_ASSIGNMENT");
    }

    assignedIds.add(String(player.id));

    player.role = normalizedRole;

    player.team = getTeamForRole(normalizedRole);
  }

  /*
   * Every active player must have
   * a role before the game starts.
   */

  for (const player of players) {
    if (!normalizeRole(player.role)) {
      return failure(`Player ${player.name || player.id} is not assigned`, "ROLE_ASSIGNMENT_INCOMPLETE");
    }
  }

  return validateRoleDistribution(game);
}

/*
|--------------------------------------------------------------------------
| ACTION SECURITY
|--------------------------------------------------------------------------
*/

function getRequiredRoleForAction(actionType) {
  switch (String(actionType || "").toUpperCase()) {
    case "KILL":
    case "MAFIA_KILL":
      return "MAFIA";

    case "PROTECT":
    case "HEAL":
    case "DOCTOR_PROTECT":
      return "DOCTOR";

    case "INVESTIGATE":
    case "CHECK":
    case "OFFICER_INVESTIGATE":
      return "OFFICER";

    default:
      return null;
  }
}

function validatePlayerAction(game, playerId, actionType, targetIds) {
  const player = getGamePlayer(game, playerId);

  if (!player) {
    return failure("Player not found", "PLAYER_NOT_FOUND");
  }

  if (player.isAlive === false) {
    return failure("Dead players cannot perform actions", "PLAYER_DEAD");
  }

  const requiredRole = getRequiredRoleForAction(actionType);

  if (!requiredRole) {
    return failure("Unsupported action", "INVALID_ACTION");
  }

  const role = normalizeRole(player.role);

  if (role !== requiredRole) {
    return failure("You are not allowed to perform this action", "ROLE_FORBIDDEN");
  }

  if (!Array.isArray(targetIds) || targetIds.length === 0) {
    return failure("A target is required", "TARGET_REQUIRED");
  }

  const target = getGamePlayer(game, targetIds[0]);

  if (!target) {
    return failure("Target player not found", "TARGET_NOT_FOUND");
  }

  if (target.isAlive === false) {
    return failure("Target player is already dead", "TARGET_DEAD");
  }

  /*
   * Mafia should not kill another Mafia
   * member by mistake.
   */

  if (requiredRole === "MAFIA" && normalizeRole(target.role) === "MAFIA") {
    return failure("Mafia cannot target another Mafia member", "INVALID_MAFIA_TARGET");
  }

  /*
   * Doctor can protect themselves.
   * Officer can investigate anyone alive.
   */

  return success();
}

/*
|--------------------------------------------------------------------------
| ROOM / DATABASE HELPERS
|--------------------------------------------------------------------------
*/

async function getDbRoom(code) {
  return Room.findOne({ where: { code } });
}

async function markRoomPlayerOnline(roomId, userId, online) {
  if (!roomId || !userId) {
    return;
  }

  await RoomPlayer.update({ connectionStatus: online ? "ONLINE" : "OFFLINE" }, { where: { RoomId: roomId, UserId: userId } });
}

async function updateRoomStatus(code, status) {
  try {
    const room = await getDbRoom(code);

    if (!room) {
      return;
    }

    await room.update({ status });
  } catch (error) {
    /*
     * Do not crash realtime gameplay
     * because DB enum/config differs.
     */

    logError("DB", `Failed to update room ${code} status`, error);
  }
}

/*
|--------------------------------------------------------------------------
| SOCKET STATE BROADCAST
|--------------------------------------------------------------------------
*/

async function broadcastState(game, roomCode) {
  if (!game || !roomCode) {
    return;
  }

  const sockets = await io.in(roomCode).fetchSockets();

  for (const client of sockets) {
    const playerId = client.data.playerId;

    const state = getVisibleState(game, playerId);

    client.emit("stateUpdate", state);

    /*
     * New frontend event.
     */
    client.emit("game:state", state);
  }

  // Realtime notification to Super Admin room
  io.to("admin_room").emit("admin:game_update", {
    roomCode,
    phase: game.phase,
    round: game.currentRound,
    playersCount: game.players?.length || 0,
    aliveCount: typeof game.getAlivePlayers === "function" ? game.getAlivePlayers().length : 0
  });

  /*
   * Lobby state is public.
   */
  if (game.phase === GamePhase.LOBBY) {
    const players = getRoomPlayers(game).map((player) => ({
      id: player.id,
      name: player.name,
      avatar: player.avatar || null,
      online: player.isConnected !== false,
      isModerator: isModerator(game, player.id),
    }));

    io.to(roomCode).emit("lobbyUpdate", {
      roomCode,
      moderatorId: game.moderatorId || game.sageId,
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      playerCount: players.length,
      players,
    });
  }
}

function broadcastPublicRooms() {
  try {
    const rooms = roomManager.getPublicRooms();
    io.emit("publicRooms:update", { rooms });
  } catch (error) {
    logError("ROOM", "Failed to broadcast public rooms update", error);
  }
}

/*
|--------------------------------------------------------------------------
| GAME END PERSISTENCE
|--------------------------------------------------------------------------
*/

async function persistFinishedGame(game, roomCode) {
  if (game.__persisting || game.__persisted) {
    return;
  }

  if (game.phase !== GamePhase.FINISHED) {
    return;
  }

  game.__persisting = true;

  const room = await getDbRoom(roomCode);

  if (!room) {
    game.__persisting = false;
    throw new Error("Database room not found");
  }

  /*
   * Avoid duplicate persistence.
   */
  const transaction = await sequelize.transaction();

  try {
    const existingGame = await Game.findOne({ where: { RoomId: room.id }, transaction });

    if (existingGame) {
      await transaction.commit();
      game.__persisted = true;
      return existingGame;
    }

    const dbGame = await Game.create(
      {
        RoomId: room.id,
        winnerTeam: game.winner || null,
        timeline: game.timeline || [],
        rulesSnapshot: game.rulesSnapshot || game.rules || null,
        finalStateSnapshot: typeof game.getReplayState === "function" ? game.getReplayState() : (game.finalStateSnapshot || null),
        startedAt: game.startedAt || new Date(),
        endedAt: new Date()
      },
      { transaction }
    );

    const players = getRoomPlayers(game);

    for (const player of players) {
      await GamePlayer.create(
        {
          GameId: dbGame.id,

          UserId: player.userId ?? player.id,

          role: player.role || null,

          team: player.team || null,

          isAlive: player.isAlive !== false,

          deathCause: player.deathCause || null,

          deathRound: player.deathRound ?? null
        },
        { transaction }
      );

      /*
       * Update stats only for real user IDs.
       */
      const userId = player.userId ?? player.id;

      const user = await User.findByPk(userId, { transaction });

      if (!user) {
        continue;
      }

      const won = player.team === game.winner;

      await user.update(
        {
          gamesPlayed: Number(user.gamesPlayed || 0) + 1,

          gamesWon: Number(user.gamesWon || 0) + (won ? 1 : 0),

          gamesLost: Number(user.gamesLost || 0) + (won ? 0 : 1)
        },
        { transaction }
      );
    }

    await room.update({ status: "FINISHED" }, { transaction });

    await transaction.commit();

    game.__persisted = true;

    log("GAME", `Game ${dbGame.id} persisted`, `room=${roomCode} winner=${game.winner}`);

    return dbGame;
  } catch (error) {
    game.__persisting = false;
    if (transaction && !transaction.finished) {
      try {
        await transaction.rollback();
      } catch {}
    }
    throw error;
  }
}

/*
|--------------------------------------------------------------------------
| SOCKET AUTH
|--------------------------------------------------------------------------
*/

io.use(async (socket, next) => {
  try {
    const token = getSocketToken(socket);

    if (!token) {
      return next(new Error("Authentication error: token missing"));
    }

    const decoded = verifyAccessToken(token);

    const user = await User.findByPk(decoded.userId);

    if (!user) {
      return next(new Error("Authentication error: user not found"));
    }

    socket.user = user;

    socket.userId = user.id;

    next();
  } catch (error) {
    logError("SOCKET_AUTH", "Socket authentication failed", error);

    next(new Error("Authentication failed"));
  }
});

/*
|--------------------------------------------------------------------------
| SOCKET CONNECTION
|--------------------------------------------------------------------------
*/

io.on("connection", (socket) => {
  log("SOCKET", `Connected ${socket.id}`, `user=${socket.userId}`);

  // Super Admin Realtime Monitoring Room
  socket.on("admin:subscribe", (_data, callback) => {
    if (socket.user?.role !== "SUPER_ADMIN") {
      return acknowledge(callback, failure("Super Admin access required", "ADMIN_FORBIDDEN"));
    }
    socket.join("admin_room");
    acknowledge(callback, success({ subscribed: true }));
  });

  /*
   * -------------------------------------------------------
   * CREATE ROOM
   * -------------------------------------------------------
   */

  socket.on("createGame", async (_data, callback) => {
    try {
      const user = socket.user;

      if (!user) {
        return acknowledge(callback, failure("Authentication required", "UNAUTHORIZED"));
      }

      const payload = typeof _data === "object" && _data !== null ? _data : {};
      const validVisibilities = ["PUBLIC", "PRIVATE", "INVITE_ONLY"];
      const visibility = validVisibilities.includes(payload.visibility) ? payload.visibility : "PUBLIC";
      const rules = payload.rules && typeof payload.rules === "object" ? payload.rules : null;

      const game = roomManager.createGame({ visibility, rules });
      if (rules && typeof game.applyCustomRules === "function") {
        game.applyCustomRules(rules);
      }

      const player = game.addPlayer(user.displayName || user.name || user.email || "Player", user.id);

      game.moderatorId = player.id;
      game.ownerId = player.id;
      game.sageId = player.id;

      if (typeof game.setSage === "function") {
        game.setSage(player.id);
      }

      player.userId = user.id;
      player.isModerator = true;
      player.role = null;
      player.team = null;

      const dbRoom = await Room.create({
        code: game.code,
        ownerId: user.id,
        visibility: game.visibility,
        inviteToken: game.inviteToken,
        rules: game.rules,
        status: "WAITING_FOR_PLAYERS"
      });

      await RoomPlayer.create({
        RoomId: dbRoom.id,
        UserId: user.id,
        connectionStatus: "ONLINE"
      });

      socket.join(game.code);
      socket.data.roomCode = game.code;
      socket.data.playerId = player.id;
      socket.data.dbRoomId = dbRoom.id;

      const sessionToken = roomManager.generateSessionToken();
      roomManager.registerSession(sessionToken, game.code, player.id);
      socket.data.sessionToken = sessionToken;

      setupGame(game, game.code);
      await broadcastState(game, game.code);
      broadcastPublicRooms();

      acknowledge(
        callback,
        success({
          roomCode: game.code,
          visibility: game.visibility,
          inviteToken: game.inviteToken,
          rules: game.rules,
          sessionToken,
          playerId: player.id,
          isModerator: true,
          isSage: false,
          state: getVisibleState(game, player.id)
        })
      );

      log("ROOM", `Room created`, `code=${game.code} owner=${user.id}`);
    } catch (error) {
      logError("ROOM", "Create room failed", error);

      acknowledge(callback, failure(error, "CREATE_ROOM_FAILED"));
    }
  });

  /*
   * -------------------------------------------------------
   * JOIN ROOM
   * -------------------------------------------------------
   */

  socket.on("joinGame", async (payload = {}, callback) => {
    try {
      const user = socket.user;

      const roomCode = normalizeRoomCode(payload.roomCode);

      if (!roomCode) {
        return acknowledge(callback, failure("Room code is required", "ROOM_CODE_REQUIRED"));
      }

      const game = roomManager.getGame(roomCode);

      if (!game) {
        return acknowledge(callback, failure("Room not found", "ROOM_NOT_FOUND"));
      }

      if (game.phase !== GamePhase.LOBBY) {
        return acknowledge(callback, failure("Game has already started", "GAME_ALREADY_STARTED"));
      }

      const currentPlayers = getRoomPlayers(game);
      const requestedName = String(payload.playerName || "").trim();

      /*
       * Existing session lookup (if sessionToken provided, reconnect that exact player).
       */
      let player = null;
      let sessionToken = payload.sessionToken;

      if (sessionToken) {
        const session = roomManager.getSession(sessionToken);
        if (session && session.roomCode === roomCode) {
          player = getGamePlayer(game, session.playerId);
        }
      }

      /*
       * Existing user membership:
       * Only reconnect as the existing player if no explicit sessionToken mismatch,
       * and if requestedName either matches the existing player's name or was not provided.
       * If requestedName is explicitly provided and differs from existing player's name,
       * treat as a new player entity so multiple players from the same device/browser can join.
       */
      if (!player) {
        const existingMember = currentPlayers.find((item) => String(item.userId ?? item.id) === String(user.id));
        if (existingMember) {
          if (!requestedName || requestedName === existingMember.name) {
            player = existingMember;
          }
        }
      }

      const isOwner = String(game.ownerId) === String(user.id) || String(game.moderatorId) === String(user.id);

      /*
       * Validate invite token if room is INVITE_ONLY
       */
      if (game.visibility === "INVITE_ONLY" && !player && !isOwner) {
        const providedToken = String(payload.inviteToken || payload.token || "").trim();
        if (!providedToken || providedToken !== String(game.inviteToken)) {
          return acknowledge(
            callback,
            failure("This room is invite-only. A valid invite link or token is required to join.", "INVITE_REQUIRED")
          );
        }
      }

      const maxAllowed = game.rules?.maxPlayers || (game.config?.maxPlayers) || MAX_PLAYERS;
      if (currentPlayers.length >= maxAllowed && !player) {
        return acknowledge(callback, failure("Room is full", "ROOM_FULL"));
      }

      /*
       * Create a new player if not reconnecting.
       */
      if (!player) {
        const displayName = String(requestedName || user.displayName || user.name || user.email || "Player").trim();

        // Pass null as id so MafiaGame generates a unique player id
        player = game.addPlayer(displayName, null);

        player.userId = user.id;

        player.isModerator = false;

        player.isConnected = true;

        sessionToken = roomManager.generateSessionToken();

        roomManager.registerSession(sessionToken, roomCode, player.id);

        const dbRoom = await getDbRoom(roomCode);

        if (dbRoom) {
          await RoomPlayer.findOrCreate({
            where: { RoomId: dbRoom.id, UserId: user.id },

            defaults: { connectionStatus: "ONLINE" }
          });

          await markRoomPlayerOnline(dbRoom.id, user.id, true);

          socket.data.dbRoomId = dbRoom.id;
        }
      } else {
        player.isConnected = true;

        sessionToken = sessionToken || roomManager.generateSessionToken();

        roomManager.registerSession(sessionToken, roomCode, player.id);

        const dbRoom = await getDbRoom(roomCode);

        if (dbRoom) {
          socket.data.dbRoomId = dbRoom.id;

          await markRoomPlayerOnline(dbRoom.id, user.id, true);
        }
      }

      socket.join(roomCode);

      socket.data.roomCode = roomCode;

      socket.data.playerId = player.id;

      socket.data.sessionToken = sessionToken;

      setupGame(game, roomCode);

      await broadcastState(game, roomCode);
      broadcastPublicRooms();

      acknowledge(
        callback,
        success({
          roomCode,
          visibility: game.visibility,
          inviteToken: game.inviteToken,
          rules: game.rules,
          sessionToken,
          playerId: player.id,
          isModerator: isModerator(game, player.id),
          isSage: false,
          state: getVisibleState(game, player.id)
        })
      );

      log("ROOM", `Player joined`, `room=${roomCode} user=${user.id}`);
    } catch (error) {
      logError("ROOM", "Join room failed", error);

      acknowledge(callback, failure(error, "JOIN_ROOM_FAILED"));
    }
  });

  /*
   * -------------------------------------------------------
   * PUBLIC ROOMS DISCOVERY
   * -------------------------------------------------------
   */

  socket.on("getPublicRooms", (_data, callback) => {
    try {
      const publicRooms = roomManager.getPublicRooms();
      acknowledge(callback, success({ rooms: publicRooms }));
    } catch (error) {
      logError("ROOM", "getPublicRooms failed", error);
      acknowledge(callback, failure(error, "GET_PUBLIC_ROOMS_FAILED"));
    }
  });

  /*
   * -------------------------------------------------------
   * GET CURRENT STATE
   * -------------------------------------------------------
   */

  socket.on("getRoomState", (_data, callback) => {
    try {
      const roomCode = socket.data.roomCode;

      const playerId = socket.data.playerId;

      if (!roomCode) {
        return acknowledge(callback, failure("You are not inside a room", "NOT_IN_ROOM"));
      }

      const game = roomManager.getGame(roomCode);

      if (!game) {
        return acknowledge(callback, failure("Game not found", "GAME_NOT_FOUND"));
      }

      acknowledge(callback, success({ state: getVisibleState(game, playerId) }));
    } catch (error) {
      acknowledge(callback, failure(error, "STATE_SYNC_FAILED"));
    }
  });

  socket.on("getGameState", (_data, callback) => {
    try {
      const roomCode = socket.data.roomCode;
      const playerId = socket.data.playerId;
      if (!roomCode) return acknowledge(callback, failure("You are not inside a room", "NOT_IN_ROOM"));
      const game = roomManager.getGame(roomCode);
      if (!game) return acknowledge(callback, failure("Game not found", "GAME_NOT_FOUND"));
      acknowledge(callback, success({ state: getVisibleState(game, playerId) }));
    } catch (error) {
      acknowledge(callback, failure(error, "STATE_SYNC_FAILED"));
    }
  });

  /*
   * -------------------------------------------------------
   * LEAVE ROOM
   * -------------------------------------------------------
   */

  socket.on("leaveGame", async (_data, callback) => {
    try {
      const roomCode = socket.data.roomCode;

      const playerId = socket.data.playerId;

      if (!roomCode || !playerId) {
        return acknowledge(callback, success());
      }

      const game = roomManager.getGame(roomCode);

      if (game) {
        const moderator = isModerator(game, playerId);

        if (game.phase === GamePhase.LOBBY) {
          if (moderator) {
            /*
             * Transfer Moderator role
             * instead of leaving the room broken.
             */
            const replacement = getRoomPlayers(game).find((player) => String(player.id) !== String(playerId) && player.isConnected !== false);

            if (replacement) {
              game.moderatorId = replacement.id;
              game.ownerId = replacement.id;
              game.sageId = replacement.id;
              if (typeof game.setSage === "function") {
                game.setSage(replacement.id);
              }

              replacement.isModerator = true;

              const room = await getDbRoom(roomCode);

              if (room) {
                await room.update({ ownerId: replacement.userId ?? replacement.id });
              }
            } else {
              if (typeof game.cancelGame === "function") {
                game.cancelGame();
              }

              await updateRoomStatus(roomCode, "CANCELLED");
              roomManager.removeGame(roomCode);
            }
          }
          if (typeof game.removePlayer === "function") {
            game.removePlayer(playerId);
          }
        }

        await broadcastState(game, roomCode);
        broadcastPublicRooms();
      }

      await markRoomPlayerOnline(socket.data.dbRoomId, socket.userId, false);

      socket.leave(roomCode);

      socket.data.roomCode = null;

      socket.data.playerId = null;

      socket.data.sessionToken = null;

      socket.data.dbRoomId = null;

      acknowledge(callback, success());
    } catch (error) {
      logError("ROOM", "Leave room failed", error);

      acknowledge(callback, failure(error, "LEAVE_ROOM_FAILED"));
    }
  });

  /*
   * -------------------------------------------------------
   * GENERIC PLAYER ACTION
   * -------------------------------------------------------
   */

  socket.on("playerAction", async (action = {}, callback) => {
    try {
      const roomCode = socket.data.roomCode;

      const playerId = socket.data.playerId;

      const game = roomCode ? roomManager.getGame(roomCode) : null;

      if (!game || !playerId) {
        return acknowledge(callback, failure("Unauthorized", "UNAUTHORIZED"));
      }

      const actionType = String(action.type || "").toUpperCase();

      const targetIds = Array.isArray(action.targetIds) ? action.targetIds : action.targetId ? [action.targetId] : [];

      const permission = validatePlayerAction(game, playerId, actionType, targetIds);

      if (!permission.success) {
        return acknowledge(callback, permission);
      }

      if (typeof game.submitAction !== "function") {
        return acknowledge(callback, failure("Game engine does not implement submitAction", "ENGINE_ACTION_MISSING"));
      }

      const result = await game.submitAction(playerId, actionType, targetIds);

      if (typeof game.allActionsSubmitted === "function" && game.allActionsSubmitted()) {
        if (typeof game.advancePhase === "function") {
          await game.advancePhase();
        }
      }

      acknowledge(callback, result?.success === false ? result : success({ result }));

      await broadcastState(game, roomCode);
    } catch (error) {
      acknowledge(callback, failure(error, "ACTION_FAILED"));
    }
  });

  /*
   * -------------------------------------------------------
   * ROLE SPECIFIC ACTIONS
   * -------------------------------------------------------
   */

  socket.on("mafia:kill", async (payload = {}, callback) => {
    await executeRoleAction(socket, "KILL", payload, callback);
  });

  socket.on("doctor:protect", async (payload = {}, callback) => {
    await executeRoleAction(socket, "PROTECT", payload, callback);
  });

  socket.on("officer:investigate", async (payload = {}, callback) => {
    await executeRoleAction(socket, "INVESTIGATE", payload, callback);
  });

  /*
   * -------------------------------------------------------
   * VOTING
   * -------------------------------------------------------
   */

  socket.on("submitVote", async (payload = {}, callback) => {
    try {
      const roomCode = socket.data.roomCode;

      const playerId = socket.data.playerId;

      const game = roomCode ? roomManager.getGame(roomCode) : null;

      if (!game || !playerId) {
        return acknowledge(callback, failure("Unauthorized", "UNAUTHORIZED"));
      }

      const voter = getGamePlayer(game, playerId);

      const target = getGamePlayer(game, payload.targetId);

      if (!voter) {
        return acknowledge(callback, failure("Player not found", "PLAYER_NOT_FOUND"));
      }

      if (voter.isAlive === false) {
        return acknowledge(callback, failure("Dead players cannot vote", "PLAYER_DEAD"));
      }

      if (!target) {
        return acknowledge(callback, failure("Vote target not found", "TARGET_NOT_FOUND"));
      }

      if (target.isAlive === false) {
        return acknowledge(callback, failure("You cannot vote for a dead player", "TARGET_DEAD"));
      }

      if (String(voter.id) === String(target.id)) {
        return acknowledge(callback, failure("You cannot vote for yourself", "SELF_VOTE_FORBIDDEN"));
      }

      if (typeof game.submitVote !== "function") {
        return acknowledge(callback, failure("Game engine does not implement voting", "ENGINE_VOTE_MISSING"));
      }

      const result = await game.submitVote(playerId, target.id);

      if (typeof game.allVotesSubmitted === "function" && game.allVotesSubmitted()) {
        if (typeof game.advancePhase === "function") {
          await game.advancePhase();
        }
      }

      acknowledge(callback, result?.success === false ? result : success({ result }));

      await broadcastState(game, roomCode);
    } catch (error) {
      acknowledge(callback, failure(error, "VOTE_FAILED"));
    }
  });

  /*
   * -------------------------------------------------------
   * CHAT
   * -------------------------------------------------------
   */

  socket.on("sendChat", async (payload = {}, callback) => {
    try {
      const roomCode = socket.data.roomCode;

      const playerId = socket.data.playerId;

      const game = roomCode ? roomManager.getGame(roomCode) : null;

      if (!game || !playerId) {
        return acknowledge(callback, failure("Unauthorized", "UNAUTHORIZED"));
      }

      const player = getGamePlayer(game, playerId);

      if (!player) {
        return acknowledge(callback, failure("Player not found", "PLAYER_NOT_FOUND"));
      }

      if (player.isAlive === false) {
        return acknowledge(callback, failure("Dead players cannot chat", "CHAT_FORBIDDEN"));
      }

      const message = String(payload.message || "").trim();

      if (!message) {
        return acknowledge(callback, failure("Message cannot be empty", "EMPTY_MESSAGE"));
      }

      if (message.length > 500) {
        return acknowledge(callback, failure("Message too long", "MESSAGE_TOO_LONG"));
      }

      const channel = payload.channel;

      if (typeof game.sendChat !== "function") {
        return acknowledge(callback, failure("Game engine does not implement chat", "ENGINE_CHAT_MISSING"));
      }

      const result = await game.sendChat(playerId, channel, message);

      if (!result || result.success === false) {
        return acknowledge(callback, result || failure("Chat forbidden", "CHAT_FORBIDDEN"));
      }

      const roomSockets = await io.in(roomCode).fetchSockets();

      for (const client of roomSockets) {
        const clientPlayer = getGamePlayer(game, client.data.playerId);

        const canRead = isModerator(game, client.data.playerId) || game.canReadChannel?.(clientPlayer, channel);

        if (canRead) {
          client.emit("chatMessage", result.message);
        }
      }

      acknowledge(callback, success());
    } catch (error) {
      acknowledge(callback, failure(error, "CHAT_FAILED"));
    }
  });

  /*
   * -------------------------------------------------------
   * MODERATOR — ASSIGN ROLE
   * -------------------------------------------------------
   */

  socket.on("moderator:assignRole", async (payload = {}, callback) => {
    try {
      const context = getModeratorContext(socket);

      if (!context.success) {
        return acknowledge(callback, context);
      }

      const { game, roomCode } = context;

      if (game.phase !== GamePhase.LOBBY) {
        return acknowledge(callback, failure("Roles can only be assigned in lobby", "ROLE_ASSIGNMENT_CLOSED"));
      }

      assignRole(game, payload.playerId, payload.role);

      await broadcastState(game, roomCode);

      acknowledge(
        callback,
        success({
          playerId: payload.playerId,

          role: normalizeRole(payload.role)
        })
      );
    } catch (error) {
      acknowledge(callback, failure(error, "ROLE_ASSIGN_FAILED"));
    }
  });

  /*
   * -------------------------------------------------------
   * MODERATOR — ASSIGN ALL ROLES
   * -------------------------------------------------------
   */

  socket.on("moderator:assignRoles", async (payload = {}, callback) => {
    try {
      const context = getModeratorContext(socket);

      if (!context.success) {
        return acknowledge(callback, context);
      }

      const { game, roomCode } = context;

      if (game.phase !== GamePhase.LOBBY && game.phase !== GamePhase.ROLE_ASSIGNMENT) {
        return acknowledge(callback, failure("Roles can only be assigned in lobby", "ROLE_ASSIGNMENT_CLOSED"));
      }

      let result;
      if (payload.roleCounts) {
        const counts = {
          MAFIA: Number(payload.roleCounts.MAFIA || 0),
          DOCTOR: Number(payload.roleCounts.DOCTOR || 0),
          OFFICER: Number(payload.roleCounts.OFFICER || 0),
          VILLAGER: Number(payload.roleCounts.VILLAGER || 0),
        };
        try {
          if (typeof game.assignRoles === "function") {
            game.assignRoles(counts);
          }
          result = validateRoleDistribution(game);
        } catch (err) {
          result = failure(err.message, "ASSIGN_ROLES_FAILED");
        }
      } else {
        result = assignRoles(game, payload.roleAssignments);
      }

      if (!result.success) {
        return acknowledge(callback, result);
      }

      await broadcastState(game, roomCode);

      acknowledge(callback, success({ roleCounts: result.roleCounts }));
    } catch (error) {
      acknowledge(callback, failure(error, "ASSIGN_ROLES_FAILED"));
    }
  });

  /*
   * -------------------------------------------------------
   * MODERATOR — START GAME
   * -------------------------------------------------------
   */

  socket.on("moderator:startGame", async (payload = {}, callback) => {
    try {
      const context = getModeratorContext(socket);

      if (!context.success) {
        return acknowledge(callback, context);
      }

      const { game, roomCode } = context;

      if (game.phase !== GamePhase.LOBBY && game.phase !== GamePhase.ROLE_ASSIGNMENT) {
        return acknowledge(callback, failure("Game can only start from lobby", "INVALID_GAME_PHASE"));
      }

      // If roleCounts provided at start time, assign them now
      if (payload.roleCounts && typeof game.assignRoles === "function") {
        const counts = {
          MAFIA: Number(payload.roleCounts.MAFIA || 0),
          DOCTOR: Number(payload.roleCounts.DOCTOR || 0),
          OFFICER: Number(payload.roleCounts.OFFICER || 0),
          VILLAGER: Number(payload.roleCounts.VILLAGER || 0),
        };
        try {
          game.assignRoles(counts);
        } catch (err) {
          return acknowledge(callback, failure(err.message, "ASSIGN_ROLES_FAILED"));
        }
      }

      const validation = validateRoleDistribution(game);

      if (!validation.success) {
        return acknowledge(callback, validation);
      }

      /*
       * Optional game configuration.
       */
      const config = payload.config || {};

      if (typeof game.updateDefaultConfig === "function") {
        const updates = {};
        if (config.mafiaKillCount != null) updates.mafiaKillCount = config.mafiaKillCount;
        if (config.doctorHealCount != null) updates.doctorHealCount = config.doctorHealCount;
        if (config.timers?.NIGHT_MAFIA != null) updates.mafiaTimerSeconds = config.timers.NIGHT_MAFIA;
        if (config.timers?.NIGHT_DOCTOR != null) updates.doctorTimerSeconds = config.timers.NIGHT_DOCTOR;
        if (config.timers?.NIGHT_OFFICER != null) updates.officerTimerSeconds = config.timers.NIGHT_OFFICER;
        if (config.timers?.DISCUSSION != null) updates.discussionTimerSeconds = config.timers.DISCUSSION;
        if (config.timers?.VOTING != null) updates.votingTimerSeconds = config.timers.VOTING;
        game.updateDefaultConfig(updates);
      }

      /*
       * VERY IMPORTANT:
       * Do not randomly assign roles here.
       *
       * The moderator already assigned
       * the roles in the lobby.
       */

      if (typeof game.startGame !== "function") {
        throw new Error("Game engine does not implement startGame()");
      }

      game.phase = GamePhase.ROLE_ASSIGNMENT;

      await game.startGame();

      await updateRoomStatus(roomCode, "PLAYING");

      await broadcastState(game, roomCode);
      broadcastPublicRooms();

      acknowledge(callback, success({ state: getVisibleState(game, socket.data.playerId) }));

      log("GAME", `Game started`, `room=${roomCode}`);
    } catch (error) {
      logError("GAME", "Start game failed", error);

      acknowledge(callback, failure(error, "START_GAME_FAILED"));
    }
  });

  /*
   * -------------------------------------------------------
   * MODERATOR COMMANDS
   * -------------------------------------------------------
   */

  socket.on("moderator:command", async (command = {}, callback) => {
    try {
      const context = getModeratorContext(socket);

      if (!context.success) {
        return acknowledge(callback, context);
      }

      const { game, roomCode } = context;

      const type = String(command.type || "").toUpperCase();

      const payload = command.payload || {};

      if (game.phase !== GamePhase.LOBBY && game.phase !== GamePhase.ROLE_ASSIGNMENT && type !== "CANCEL_GAME") {
        return acknowledge(callback, failure("Moderator commands are only allowed during lobby setup", "COMMAND_NOT_ALLOWED_IN_GAME"));
      }

      switch (type) {
        case "ADVANCE_PHASE": {
          if (typeof game.advancePhase !== "function") {
            throw new Error("advancePhase() is not implemented");
          }

          await game.advancePhase();

          break;
        }

        case "EXTEND_TIMER": {
          if (typeof game.extendTimer !== "function") {
            throw new Error("extendTimer() is not implemented");
          }

          const seconds = Number(payload.seconds || 0);

          if (seconds <= 0) {
            throw new Error("Invalid timer extension");
          }

          await game.extendTimer(seconds);

          break;
        }

        case "ANNOUNCE": {
          const text = String(payload.text || "").trim();

          if (!text) {
            throw new Error("Announcement text is required");
          }

          await game.createAnnouncement?.(text);

          break;
        }

        case "UPDATE_CONFIG": {
          await game.updateRoundConfig?.(payload);

          break;
        }

        case "CANCEL_GAME": {
          if (game.phase === GamePhase.FINISHED) {
            throw new Error("Finished game cannot be cancelled");
          }

          await game.cancelGame?.();

          await updateRoomStatus(roomCode, "CANCELLED");

          break;
        }

        case "REVEAL_INVESTIGATION": {
          /*
           * Development/admin only command.
           */
          await game.devRevealInvestigation?.(payload.targetId);

          break;
        }

        case "SET_WINNER": {
          await game.devSetWinner?.(payload.team);

          break;
        }

        default:
          return acknowledge(callback, failure(`Unknown moderator command: ${type}`, "UNKNOWN_COMMAND"));
      }

      await broadcastState(game, roomCode);

      acknowledge(callback, success());
    } catch (error) {
      logError("MODERATOR", "Moderator command failed", error);

      acknowledge(callback, failure(error, "MODERATOR_COMMAND_FAILED"));
    }
  });

  /*
   * -------------------------------------------------------
   * BACKWARD COMPATIBILITY
   *
   * Keep sageCommand because your current
   * frontend already uses it.
   * -------------------------------------------------------
   */

  socket.on("sageCommand", async (command = {}, callback) => {
    try {
      /*
       * Convert old Sage terminology
       * into Moderator behavior.
       */
      const context = getModeratorContext(socket);

      if (!context.success) {
        return acknowledge(callback, context);
      }

      const { game, roomCode } = context;

      const type = String(command.type || "").toUpperCase();

      const payload = command.payload || {};

      if (type === "START_GAME") {
        /*
         * Preferred:
         *
         * payload.roleAssignments
         *
         * {
         *   "player-id-1": "MAFIA",
         *   "player-id-2": "DOCTOR"
         * }
         */

        if (payload.roleAssignments) {
          const result = assignRoles(game, payload.roleAssignments);

          if (!result.success) {
            return acknowledge(callback, result);
          }
        }

        /*
         * Legacy roleCounts support.
         *
         * This remains only for frontend compatibility.
         */
        if (!payload.roleAssignments && payload.roleCounts && typeof game.assignRoles === "function") {
          /*
           * IMPORTANT:
           * The new UI should NOT use this.
           */
          game.assignRoles(payload.roleCounts);
        }

        const validation = validateRoleDistribution(game);

        if (!validation.success) {
          return acknowledge(callback, validation);
        }

        if (payload.config) {
          if (typeof game.updateDefaultConfig === "function") {
            const updates = {};
            if (payload.config.mafiaKillCount != null) updates.mafiaKillCount = payload.config.mafiaKillCount;
            if (payload.config.doctorHealCount != null) updates.doctorHealCount = payload.config.doctorHealCount;
            if (payload.config.timers?.NIGHT_MAFIA != null) updates.mafiaTimerSeconds = payload.config.timers.NIGHT_MAFIA;
            if (payload.config.timers?.NIGHT_DOCTOR != null) updates.doctorTimerSeconds = payload.config.timers.NIGHT_DOCTOR;
            if (payload.config.timers?.NIGHT_OFFICER != null) updates.officerTimerSeconds = payload.config.timers.NIGHT_OFFICER;
            if (payload.config.timers?.DISCUSSION != null) updates.discussionTimerSeconds = payload.config.timers.DISCUSSION;
            if (payload.config.timers?.VOTING != null) updates.votingTimerSeconds = payload.config.timers.VOTING;
            game.updateDefaultConfig(updates);
          }
        }

        game.phase = GamePhase.ROLE_ASSIGNMENT;

        await game.startGame();

        await updateRoomStatus(roomCode, "PLAYING");
      } else {
        /*
         * Forward other legacy commands
         * to the new moderator command logic.
         */
        switch (type) {
          case "ADVANCE_PHASE":
            await game.advancePhase?.();
            break;

          case "EXTEND_TIMER":
            await game.extendTimer?.(Number(payload.seconds || 0));
            break;

          case "REVEAL_INVESTIGATION":
            await game.devRevealInvestigation?.(payload.targetId);
            break;

          case "SET_WINNER":
            await game.devSetWinner?.(payload.team);
            break;

          case "ANNOUNCE":
            await game.createAnnouncement?.(payload.text);
            break;

          case "UPDATE_CONFIG":
            await game.updateRoundConfig?.(payload);
            break;

          case "CANCEL_GAME":
            await game.cancelGame?.();

            await updateRoomStatus(roomCode, "CANCELLED");
            break;

          default:
            return acknowledge(callback, failure(`Unknown command: ${type}`, "UNKNOWN_COMMAND"));
        }
      }

      await broadcastState(game, roomCode);

      acknowledge(callback, success());
    } catch (error) {
      logError("MODERATOR", "Legacy sageCommand failed", error);

      acknowledge(callback, failure(error, "MODERATOR_COMMAND_FAILED"));
    }
  });

  /*
   * -------------------------------------------------------
   * DISCONNECT
   * -------------------------------------------------------
   */

  socket.on("disconnect", async (reason) => {
    try {
      const roomCode = socket.data.roomCode;

      const playerId = socket.data.playerId;

      log("SOCKET", `Disconnected ${socket.id}`, `reason=${reason}`);

      if (!roomCode || !playerId) {
        return;
      }

      const game = roomManager.getGame(roomCode);

      if (!game) {
        return;
      }

      const player = getGamePlayer(game, playerId);

      if (player && !isModerator(game, playerId)) {
        player.isConnected = false;
      }

      /*
       * Do not immediately destroy player state.
       *
       * Reconnection is expected.
       */
      await markRoomPlayerOnline(socket.data.dbRoomId, socket.userId, false);

      await broadcastState(game, roomCode);
      broadcastPublicRooms();
    } catch (error) {
      logError("SOCKET", "Disconnect handler failed", error);
    }
  });
});

/*
|--------------------------------------------------------------------------
| ROLE ACTION EXECUTOR
|--------------------------------------------------------------------------
*/

async function executeRoleAction(socket, actionType, payload, callback) {
  try {
    const roomCode = socket.data.roomCode;

    const playerId = socket.data.playerId;

    if (!roomCode || !playerId) {
      return acknowledge(callback, failure("Unauthorized", "UNAUTHORIZED"));
    }

    const game = roomManager.getGame(roomCode);

    if (!game) {
      return acknowledge(callback, failure("Game not found", "GAME_NOT_FOUND"));
    }

    const targetIds = Array.isArray(payload.targetIds) ? payload.targetIds : payload.targetId ? [payload.targetId] : [];

    const permission = validatePlayerAction(game, playerId, actionType, targetIds);

    if (!permission.success) {
      return acknowledge(callback, permission);
    }

    if (typeof game.submitAction !== "function") {
      return acknowledge(callback, failure("Game engine does not support actions", "ENGINE_ACTION_MISSING"));
    }

    const result = await game.submitAction(playerId, actionType, targetIds);

    if (typeof game.allActionsSubmitted === "function" && game.allActionsSubmitted()) {
      if (typeof game.advancePhase === "function") {
        await game.advancePhase();
      }
    }

    acknowledge(callback, result?.success === false ? result : success({ result }));

    await broadcastState(game, roomCode);
  } catch (error) {
    acknowledge(callback, failure(error, "ACTION_FAILED"));
  }
}

/*
|--------------------------------------------------------------------------
| MODERATOR CONTEXT
|--------------------------------------------------------------------------
*/

function getModeratorContext(socket) {
  const roomCode = socket.data.roomCode;

  const playerId = socket.data.playerId;

  if (!roomCode || !playerId) {
    return failure("Unauthorized", "UNAUTHORIZED");
  }

  const game = roomManager.getGame(roomCode);

  if (!game) {
    return failure("Game not found", "GAME_NOT_FOUND");
  }

  if (!isModerator(game, playerId)) {
    return failure("Only the Room Moderator can do this", "MODERATOR_ONLY");
  }

  return { success: true, game, roomCode, playerId };
}

/*
|--------------------------------------------------------------------------
| GAME EVENT BRIDGE
|--------------------------------------------------------------------------
*/

function setupGame(game, roomCode) {
  if (!game || game.__socketBridgeAttached) {
    return;
  }

  game.__socketBridgeAttached = true;

  game.onStateChange = async () => {
    try {
      await broadcastState(game, roomCode);

      if (game.phase === GamePhase.FINISHED && !game.__persisted) {
        await persistFinishedGame(game, roomCode);
      }
    } catch (error) {
      logError("GAME", `State broadcast failed for ${roomCode}`, error);
    }
  };
}

/*
|--------------------------------------------------------------------------
| HEALTH
|--------------------------------------------------------------------------
*/

app.get("/health", (_req, res) => {
  // prettier-ignore
  res.status(200).json({
      status: "ok",
      service: "mafia-game-server",
      environment:
        NODE_ENV,
      timestamp:
        new Date().toISOString(),
    });
});

app.get("/health/ready", async (_req, res) => {
  try {
    await sequelize.authenticate();

    // prettier-ignore
    res.status(200).json({
        status: "ready",
        database: "connected",
      });
  } catch (error) {
    // prettier-ignore
    res.status(503).json({
        status: "not_ready",
        database:
          "disconnected",
        error:
          NODE_ENV ===
          "development"
            ? error.message
            : undefined,
      });
  }
});

/*
|--------------------------------------------------------------------------
| AUTH ROUTES
|--------------------------------------------------------------------------
*/

app.use("/api/auth", authRouter);
app.use("/api/admin", createAdminRouter({ roomManager, io }));
app.use("/api/rooms", createRoomsRouter({ roomManager }));

/*
 * Legacy Google callback compatibility.
 */
app.get("/api/google/callback", (req, res) => {
  const query = req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : "";

  res.redirect(`/api/auth/google/callback${query}`);
});

/*
|--------------------------------------------------------------------------
| FRONTEND
|--------------------------------------------------------------------------
*/

const distCandidates = [
  path.join(__dirname, "../../frontend/dist"),
  path.join(__dirname, "../dist"),
  path.join(__dirname, "../../dist"),
];
const distPath = distCandidates.find((dir) => fs.existsSync(dir)) || distCandidates[0];

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath, { index: false }));

  app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
    const indexPath = path.join(distPath, "index.html");

    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }

    return res.status(404).json({ success: false, error: "Frontend build not found" });
  });
} else {
  log("FRONTEND", `Dist directory not found: ${distPath}`);
}

/*
|--------------------------------------------------------------------------
| 404
|--------------------------------------------------------------------------
*/

app.use(URL_Error);

/*
|--------------------------------------------------------------------------
| GLOBAL ERROR HANDLER
|--------------------------------------------------------------------------
*/

app.use(GlobalError);

/*
|--------------------------------------------------------------------------
| PROCESS ERROR HANDLING
|--------------------------------------------------------------------------
*/

process.on("uncaughtException", (error) => {
  logError("PROCESS", "Uncaught exception", error);

  try {
    handleErrorCode(error);
  } catch {
    // Keep supervisor alive.
  }
});

process.on("unhandledRejection", (reason) => {
  logError("PROCESS", "Unhandled rejection", reason);

  try {
    handleRuntimeError(reason);
  } catch {
    // Ignore secondary error.
  }
});

/*
|--------------------------------------------------------------------------
| GRACEFUL SHUTDOWN
|--------------------------------------------------------------------------
*/

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  log("SERVER", `Received ${signal}. Starting graceful shutdown...`);

  try {
    io.close();
  } catch (error) {
    logError("SERVER", "Failed to close Socket.IO", error);
  }

  await new Promise((resolve) => {
    httpServer.close(() => resolve());
  }).catch(() => {});

  try {
    if (typeof roomManager.shutdown === "function") {
      await roomManager.shutdown();
    }
  } catch (error) {
    logError("ROOM", "RoomManager shutdown failed", error);
  }

  try {
    await sequelize.close();

    log("DB", "Database connection closed");
  } catch (error) {
    logError("DB", "Database shutdown failed", error);
  }

  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));

process.on("SIGTERM", () => shutdown("SIGTERM"));

/*
|--------------------------------------------------------------------------
| START SERVER
|--------------------------------------------------------------------------
*/

async function startServer() {
  if (!JWT_SECRET) {
    throw new Error("JWT_KEY is required");
  }

  await sequelize.authenticate();

  log("DB", "Successfully connected to MySQL database using Sequelize.");

  // Seed Super Admin account idempotently
  try {
    await seedAdmin();
  } catch (err) {
    logError("ADMIN", "Admin seeder execution error", err);
  }

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      httpServer.removeListener("error", onError);

      reject(error);
    };

    httpServer.once("error", onError);

    httpServer.listen(PORT, "0.0.0.0", () => {
      httpServer.removeListener("error", onError);

      resolve();
    });
  });

  log("SERVER", `Mafia server running on port ${PORT}`, `env=${NODE_ENV}`);

  log("SERVER", `Players: ${MIN_PLAYERS}-${MAX_PLAYERS}`);

  log("SERVER", "Socket.IO realtime engine is ready");
}

startServer().catch((error) => {
  logError("SERVER", "Unable to start server", error);

  process.exit(1);
});
