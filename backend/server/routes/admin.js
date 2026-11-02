// backend/server/routes/admin.js
import { Router } from "express";
import jwt from "jsonwebtoken";
import { Op } from "sequelize";
import { models } from "../db/index.js";
import { DEFAULT_GAME_RULES } from "../../../shared/enums.js";
import { requireAuth, requireSuperAdmin, logAdminAction } from "../middleware/adminAuth.js";
import { verifyPassword, hashPassword } from "../utils/password.js";

const { User, Room, RoomPlayer, Game, GamePlayer, AdminAuditLog } = models;
const JWT_SECRET = process.env.JWT_KEY || "default_secret";

export function createAdminRouter({ roomManager, io }) {
  const router = Router();

  /* ─────────────────────────────────────────────────────────────
     1. ADMIN AUTHENTICATION
     ───────────────────────────────────────────────────────────── */

  // POST /api/admin/auth/login
  router.post("/auth/login", async (req, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      const password = String(req.body?.password || "").trim();

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          code: "VALIDATION_ERROR",
          error: "Email and password are required"
        });
      }

      const user = await User.findOne({ where: { email } });
      if (!user) {
        return res.status(401).json({
          success: false,
          code: "INVALID_CREDENTIALS",
          error: "Invalid email or password"
        });
      }

      if (!user.password || !verifyPassword(password, user.password)) {
        await logAdminAction({
          adminUser: user,
          action: "ADMIN_LOGIN_FAILED",
          targetType: "USER",
          targetId: user.id,
          details: { email, reason: "Invalid password" },
          req,
          status: "FAILED"
        });

        return res.status(401).json({
          success: false,
          code: "INVALID_CREDENTIALS",
          error: "Invalid email or password"
        });
      }

      if (user.role !== "SUPER_ADMIN") {
        await logAdminAction({
          adminUser: user,
          action: "ADMIN_LOGIN_REJECTED",
          targetType: "USER",
          targetId: user.id,
          details: { email, role: user.role, reason: "Insufficient privileges" },
          req,
          status: "FAILED"
        });

        return res.status(403).json({
          success: false,
          code: "ADMIN_FORBIDDEN",
          error: "Access denied. Super Admin role required."
        });
      }

      if (user.isBlocked) {
        return res.status(403).json({
          success: false,
          code: "USER_BLOCKED",
          error: "Account has been suspended"
        });
      }

      // Generate Super Admin JWT
      const token = jwt.sign(
        {
          id: user.id,
          userId: user.id,
          email: user.email,
          role: "SUPER_ADMIN",
          type: "access"
        },
        JWT_SECRET,
        { expiresIn: "24h" }
      );

      await logAdminAction({
        adminUser: user,
        action: "ADMIN_LOGIN",
        targetType: "USER",
        targetId: user.id,
        details: { email: user.email },
        req,
        status: "SUCCESS"
      });

      return res.json({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role
        }
      });
    } catch (error) {
      console.error("[ADMIN_AUTH_LOGIN_ERROR]", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // Apply Auth & Super Admin Guard for all remaining routes
  router.use(requireAuth, requireSuperAdmin);

  // GET /api/admin/auth/me
  router.get("/auth/me", (req, res) => {
    res.json({
      success: true,
      user: {
        id: req.user.id,
        email: req.user.email,
        displayName: req.user.displayName,
        role: req.user.role,
        createdAt: req.user.createdAt,
        lastActiveAt: req.user.lastActiveAt
      }
    });
  });

  // PUT /api/admin/auth/profile
  router.put("/auth/profile", async (req, res) => {
    try {
      const { displayName, currentPassword, newPassword } = req.body || {};
      const updates = {};

      if (displayName && typeof displayName === "string") {
        updates.displayName = displayName.trim().slice(0, 50);
      }

      if (newPassword) {
        if (!currentPassword || !verifyPassword(currentPassword, req.user.password)) {
          return res.status(400).json({ success: false, error: "Current password is required and must match" });
        }
        if (newPassword.length < 8) {
          return res.status(400).json({ success: false, error: "New password must be at least 8 characters long" });
        }
        updates.password = hashPassword(newPassword);
      }

      if (Object.keys(updates).length > 0) {
        await req.user.update(updates);
        await logAdminAction({
          adminUser: req.user,
          action: "UPDATE_ADMIN_PROFILE",
          targetType: "USER",
          targetId: req.user.id,
          details: { updatedFields: Object.keys(updates) },
          req
        });
      }

      res.json({
        success: true,
        user: {
          id: req.user.id,
          email: req.user.email,
          displayName: req.user.displayName,
          role: req.user.role
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /* ─────────────────────────────────────────────────────────────
     2. DASHBOARD OVERVIEW & REALTIME KPIS
     ───────────────────────────────────────────────────────────── */

  // GET /api/admin/dashboard
  router.get("/dashboard", async (req, res) => {
    try {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Run DB queries in parallel
      const [
        totalUsers,
        onlineUsers,
        activeUsers24h,
        totalRooms,
        completedGames,
        gamesToday,
        gamesThisWeek,
        gamesThisMonth,
        mafiaWins,
        villageWins,
        recentGames,
        recentAudits
      ] = await Promise.all([
        User.count(),
        User.count({ where: { isOnline: true } }),
        User.count({ where: { lastActiveAt: { [Op.gte]: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } }),
        Room.count(),
        Game.count({ where: { status: "FINISHED" } }),
        Game.count({ where: { startedAt: { [Op.gte]: startOfToday } } }),
        Game.count({ where: { startedAt: { [Op.gte]: sevenDaysAgo } } }),
        Game.count({ where: { startedAt: { [Op.gte]: startOfMonth } } }),
        Game.count({ where: { status: "FINISHED", winnerTeam: "MAFIA" } }),
        Game.count({ where: { status: "FINISHED", winnerTeam: { [Op.in]: ["VILLAGE", "VILLAGERS"] } } }),
        Game.findAll({
          limit: 5,
          order: [["createdAt", "DESC"]],
          include: [{ model: Room, attributes: ["code"] }]
        }),
        AdminAuditLog.findAll({
          limit: 8,
          order: [["createdAt", "DESC"]]
        })
      ]);

      // Calculate live memory metrics from RoomManager
      const activeRoomsMemory = [];
      if (roomManager?.games) {
        for (const [code, game] of roomManager.games.entries()) {
          activeRoomsMemory.push({
            code,
            phase: game.phase,
            round: game.currentRound,
            playersCount: game.players?.length || 0,
            aliveCount: typeof game.getAlivePlayers === "function" ? game.getAlivePlayers().length : 0,
            timerRemaining: typeof game.getTimerRemaining === "function" ? game.getTimerRemaining() : 0,
            moderatorId: game.moderatorId
          });
        }
      }

      // Calculate win rates
      const totalResolved = mafiaWins + villageWins;
      const mafiaWinRate = totalResolved > 0 ? Math.round((mafiaWins / totalResolved) * 100) : 0;
      const villageWinRate = totalResolved > 0 ? Math.round((villageWins / totalResolved) * 100) : 0;

      // Socket live metrics
      const connectedSocketsCount = io ? io.engine?.clientsCount || 0 : 0;

      res.json({
        success: true,
        kpis: {
          totalUsers,
          onlineUsers,
          activeUsers24h,
          totalRooms,
          activeRooms: activeRoomsMemory.length,
          completedGames,
          gamesToday,
          gamesThisWeek,
          gamesThisMonth,
          mafiaWins,
          villageWins,
          mafiaWinRate,
          villageWinRate,
          connectedSockets: connectedSocketsCount
        },
        activeRooms: activeRoomsMemory,
        recentGames,
        recentAudits,
        systemHealth: {
          uptime: Math.floor(process.uptime()),
          memory: process.memoryUsage(),
          nodeVersion: process.version,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error("[ADMIN_DASHBOARD_ERROR]", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /* ─────────────────────────────────────────────────────────────
     3. USERS MANAGEMENT
     ───────────────────────────────────────────────────────────── */

  // GET /api/admin/users
  router.get("/users", async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
      const offset = (page - 1) * limit;

      const search = (req.query.search || "").trim();
      const role = req.query.role;
      const isBlocked = req.query.isBlocked;
      const isOnline = req.query.isOnline;
      const sortBy = req.query.sortBy || "createdAt";
      const sortOrder = String(req.query.sortOrder || "DESC").toUpperCase() === "ASC" ? "ASC" : "DESC";

      const where = {};

      if (search) {
        where[Op.or] = [
          { displayName: { [Op.like]: `%${search}%` } },
          { email: { [Op.like]: `%${search}%` } },
          { id: { [Op.like]: `%${search}%` } }
        ];
      }

      if (role && ["PLAYER", "SUPER_ADMIN"].includes(role)) {
        where.role = role;
      }

      if (isBlocked !== undefined && isBlocked !== "") {
        where.isBlocked = isBlocked === "true" || isBlocked === true;
      }

      if (isOnline !== undefined && isOnline !== "") {
        where.isOnline = isOnline === "true" || isOnline === true;
      }

      const allowedSortFields = ["createdAt", "lastActiveAt", "gamesPlayed", "gamesWon", "displayName", "email"];
      const orderField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";

      const { count, rows } = await User.findAndCountAll({
        where,
        attributes: { exclude: ["password"] },
        order: [[orderField, sortOrder]],
        limit,
        offset
      });

      res.json({
        success: true,
        users: rows,
        pagination: {
          total: count,
          page,
          limit,
          totalPages: Math.ceil(count / limit)
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /api/admin/users/:id
  router.get("/users/:id", async (req, res) => {
    try {
      const user = await User.findByPk(req.params.id, {
        attributes: { exclude: ["password"] }
      });

      if (!user) {
        return res.status(404).json({ success: false, error: "User not found" });
      }

      // Fetch owned rooms
      const ownedRooms = await Room.findAll({
        where: { ownerId: user.id },
        limit: 10,
        order: [["createdAt", "DESC"]]
      });

      // Fetch game history
      const gameHistory = await GamePlayer.findAll({
        where: { UserId: user.id },
        limit: 15,
        order: [["createdAt", "DESC"]],
        include: [{ model: Game, attributes: ["id", "status", "winnerTeam", "startedAt", "endedAt"] }]
      });

      // Fetch audit logs concerning this user
      const auditLogs = await AdminAuditLog.findAll({
        where: { targetId: user.id },
        limit: 10,
        order: [["createdAt", "DESC"]]
      });

      // Check if user is in an active live room right now
      let liveRoom = null;
      if (roomManager?.games) {
        for (const [code, game] of roomManager.games.entries()) {
          const match = game.players?.find((p) => String(p.userId || p.id) === String(user.id));
          if (match) {
            liveRoom = {
              roomCode: code,
              phase: game.phase,
              role: match.role,
              isAlive: match.isAlive,
              isModerator: Boolean(match.isModerator)
            };
            break;
          }
        }
      }

      res.json({
        success: true,
        user,
        ownedRooms,
        gameHistory,
        auditLogs,
        liveRoom
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // PATCH /api/admin/users/:id/block
  router.patch("/users/:id/block", async (req, res) => {
    try {
      const user = await User.findByPk(req.params.id);
      if (!user) {
        return res.status(404).json({ success: false, error: "User not found" });
      }

      if (user.id === req.user.id) {
        return res.status(400).json({ success: false, error: "You cannot block your own admin account" });
      }

      const block = req.body?.isBlocked !== undefined ? Boolean(req.body.isBlocked) : !user.isBlocked;
      await user.update({ isBlocked: block });

      // Disconnect their active socket if blocked
      if (block && io) {
        for (const socket of io.sockets.sockets.values()) {
          if (socket.userId === user.id) {
            socket.emit("accountSuspended", { message: "Your account has been suspended by an administrator." });
            socket.disconnect(true);
          }
        }
      }

      await logAdminAction({
        adminUser: req.user,
        action: block ? "BLOCK_USER" : "UNBLOCK_USER",
        targetType: "USER",
        targetId: user.id,
        details: { displayName: user.displayName, email: user.email, isBlocked: block },
        req
      });

      res.json({
        success: true,
        message: block ? "User blocked successfully" : "User unblocked successfully",
        user: { id: user.id, isBlocked: user.isBlocked }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // PATCH /api/admin/users/:id/role
  router.patch("/users/:id/role", async (req, res) => {
    try {
      const newRole = String(req.body?.role || "").toUpperCase();
      if (!["PLAYER", "SUPER_ADMIN"].includes(newRole)) {
        return res.status(400).json({ success: false, error: "Role must be PLAYER or SUPER_ADMIN" });
      }

      const user = await User.findByPk(req.params.id);
      if (!user) {
        return res.status(404).json({ success: false, error: "User not found" });
      }

      if (user.id === req.user.id && newRole !== "SUPER_ADMIN") {
        return res.status(400).json({ success: false, error: "You cannot revoke your own Super Admin role" });
      }

      const previousRole = user.role;
      await user.update({ role: newRole });

      await logAdminAction({
        adminUser: req.user,
        action: "CHANGE_ROLE",
        targetType: "USER",
        targetId: user.id,
        details: { previousRole, newRole, email: user.email },
        req
      });

      res.json({
        success: true,
        user: { id: user.id, role: user.role }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /* ─────────────────────────────────────────────────────────────
     4. ROOMS MANAGEMENT
     ───────────────────────────────────────────────────────────── */

  // GET /api/admin/rooms
  router.get("/rooms", async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
      const offset = (page - 1) * limit;

      const search = (req.query.search || "").trim();
      const status = req.query.status;
      const visibility = req.query.visibility;

      const where = {};
      if (search) {
        where.code = { [Op.like]: `%${search}%` };
      }
      if (status) {
        where.status = status;
      }
      if (visibility) {
        where.visibility = visibility;
      }

      const { count, rows } = await Room.findAndCountAll({
        where,
        order: [["createdAt", "DESC"]],
        include: [{ model: User, as: "owner", attributes: ["id", "displayName", "email"] }],
        limit,
        offset
      });

      // Augment each room with in-memory live status if active
      const roomsWithLive = rows.map((r) => {
        const plain = r.toJSON();
        const liveGame = roomManager?.getGame(plain.code);
        plain.isLive = Boolean(liveGame);
        if (liveGame) {
          plain.livePhase = liveGame.phase;
          plain.liveRound = liveGame.currentRound;
          plain.livePlayersCount = liveGame.players?.length || 0;
          plain.liveAliveCount = typeof liveGame.getAlivePlayers === "function" ? liveGame.getAlivePlayers().length : 0;
          plain.visibility = liveGame.visibility || plain.visibility || "PUBLIC";
          plain.hasInviteToken = Boolean(liveGame.inviteToken);
        }
        return plain;
      });

      res.json({
        success: true,
        rooms: roomsWithLive,
        pagination: {
          total: count,
          page,
          limit,
          totalPages: Math.ceil(count / limit)
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /api/admin/rooms/:code
  router.get("/rooms/:code", async (req, res) => {
    try {
      const code = req.params.code;
      const room = await Room.findOne({
        where: { code },
        include: [{ model: User, as: "owner", attributes: ["id", "displayName", "email"] }]
      });

      if (!room) {
        return res.status(404).json({ success: false, error: "Room not found" });
      }

      const historicalGames = await Game.findAll({
        where: { roomId: room.id },
        order: [["createdAt", "DESC"]],
        limit: 5
      });

      // Live game inspection if currently running in memory
      let liveEngineState = null;
      const liveGame = roomManager?.getGame(code);
      if (liveGame) {
        liveEngineState = {
          phase: liveGame.phase,
          round: liveGame.currentRound,
          timerRemaining: typeof liveGame.getTimerRemaining === "function" ? liveGame.getTimerRemaining() : 0,
          gameMode: liveGame.gameMode,
          moderatorId: liveGame.moderatorId,
          players: (liveGame.players || []).map((p) => ({
            id: p.id,
            userId: p.userId,
            name: p.name,
            role: p.role,
            team: p.team,
            isAlive: p.isAlive,
            isModerator: Boolean(p.isModerator),
            deathCause: p.deathCause,
            deathRound: p.deathRound
          })),
          currentRoundActions: liveGame.currentRoundData?.actions || [],
          currentRoundVotes: liveGame.currentRoundData?.votes || [],
          chatMessages: liveGame.chatMessages || {}
        };
      }

      res.json({
        success: true,
        room,
        historicalGames,
        liveEngineState
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/admin/rooms/:code/cancel
  router.post("/rooms/:code/cancel", async (req, res) => {
    try {
      const code = req.params.code;
      const room = await Room.findOne({ where: { code } });

      const liveGame = roomManager?.getGame(code);
      if (liveGame) {
        if (typeof liveGame.cancelGame === "function") {
          liveGame.cancelGame();
        }
        if (io) {
          io.to(code).emit("gameCancelled", { message: "Room was terminated by an administrator" });
        }
        roomManager.games.delete(code);
      }

      if (room) {
        await room.update({ status: "CANCELLED" });
      }

      await logAdminAction({
        adminUser: req.user,
        action: "CANCEL_ROOM",
        targetType: "ROOM",
        targetId: code,
        details: { hadLiveGame: Boolean(liveGame) },
        req
      });

      res.json({
        success: true,
        message: `Room ${code} cancelled and cleaned up successfully`
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /* ─────────────────────────────────────────────────────────────
     5. GAMES MANAGEMENT & LIVE MONITORING
     ───────────────────────────────────────────────────────────── */

  // GET /api/admin/games/active
  router.get("/games/active", (req, res) => {
    try {
      const activeList = [];
      if (roomManager?.games) {
        for (const [code, game] of roomManager.games.entries()) {
          const players = game.players || [];
          const alivePlayers = typeof game.getAlivePlayers === "function" ? game.getAlivePlayers() : players.filter((p) => p.isAlive);
          const mafiaAlive = alivePlayers.filter((p) => p.role === "MAFIA").length;
          const villageAlive = alivePlayers.filter((p) => p.role !== "MAFIA").length;

          let healthStatus = "HEALTHY";
          if (game.phase !== "LOBBY" && game.phase !== "FINISHED") {
            if (game.phaseEndsAt && Date.now() > game.phaseEndsAt + 15000) {
              healthStatus = "STUCK";
            } else if (game.phaseEndsAt && Date.now() > game.phaseEndsAt + 5000) {
              healthStatus = "DELAYED";
            }
          }

          activeList.push({
            code,
            visibility: game.visibility || "PUBLIC",
            inviteToken: game.inviteToken || null,
            phase: game.phase,
            round: game.currentRound,
            timerRemaining: typeof game.getTimerRemaining === "function" ? game.getTimerRemaining() : 0,
            totalPlayers: players.length,
            aliveCount: alivePlayers.length,
            mafiaAlive,
            villageAlive,
            gameMode: game.gameMode,
            moderatorId: game.moderatorId,
            healthStatus,
            timelineCount: game.timeline?.length || 0,
            rules: game.rules || null
          });
        }
      }

      res.json({ success: true, activeGames: activeList });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /api/admin/games
  router.get("/games", async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
      const offset = (page - 1) * limit;

      const status = req.query.status;
      const winnerTeam = req.query.winnerTeam;

      const where = {};
      if (status) where.status = status;
      if (winnerTeam) where.winnerTeam = winnerTeam;

      const { count, rows } = await Game.findAndCountAll({
        where,
        order: [["createdAt", "DESC"]],
        include: [
          { model: Room, attributes: ["code", "ownerId"] },
          { model: GamePlayer, attributes: ["id", "role", "team", "isAlive"] }
        ],
        limit,
        offset
      });

      const formatted = rows.map((g) => {
        const item = g.toJSON();
        const durationSeconds = item.endedAt && item.startedAt
          ? Math.max(0, Math.round((new Date(item.endedAt) - new Date(item.startedAt)) / 1000))
          : null;

        return {
          ...item,
          playerCount: item.GamePlayers?.length || 0,
          durationSeconds
        };
      });

      res.json({
        success: true,
        games: formatted,
        pagination: {
          total: count,
          page,
          limit,
          totalPages: Math.ceil(count / limit)
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /api/admin/games/:id
  router.get("/games/:id", async (req, res) => {
    try {
      const game = await Game.findByPk(req.params.id, {
        include: [
          { model: Room, include: [{ model: User, as: "owner", attributes: ["id", "displayName", "email"] }] },
          {
            model: GamePlayer,
            include: [{ model: User, attributes: ["id", "displayName", "email", "avatar"] }]
          }
        ]
      });

      if (!game) {
        return res.status(404).json({ success: false, error: "Game not found" });
      }

      const plain = game.toJSON();
      plain.durationSeconds = plain.endedAt && plain.startedAt
        ? Math.max(0, Math.round((new Date(plain.endedAt) - new Date(plain.startedAt)) / 1000))
        : null;

      res.json({ success: true, game: plain });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/admin/games/:code/terminate
  router.post("/games/:code/terminate", async (req, res) => {
    try {
      const code = req.params.code;
      const game = roomManager?.getGame(code);

      if (!game) {
        return res.status(404).json({ success: false, error: "Active game not found for room code" });
      }

      if (typeof game.cancelGame === "function") {
        game.cancelGame();
      }

      if (io) {
        io.to(code).emit("gameCancelled", { message: "Game was terminated by an administrator" });
      }

      roomManager.games.delete(code);

      const dbRoom = await Room.findOne({ where: { code } });
      if (dbRoom) {
        await dbRoom.update({ status: "CANCELLED" });
      }

      await logAdminAction({
        adminUser: req.user,
        action: "TERMINATE_GAME",
        targetType: "GAME",
        targetId: code,
        details: { phase: game.phase, round: game.currentRound },
        req
      });

      res.json({ success: true, message: `Game ${code} terminated successfully` });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /* ─────────────────────────────────────────────────────────────
     6. ANALYTICS
     ───────────────────────────────────────────────────────────── */

  // GET /api/admin/analytics
  router.get("/analytics", async (req, res) => {
    try {
      // Role statistics from GamePlayer table
      const [
        totalGamePlayers,
        mafiaCount,
        doctorCount,
        officerCount,
        villagerCount,
        mafiaWonCount,
        villageWonCount
      ] = await Promise.all([
        GamePlayer.count(),
        GamePlayer.count({ where: { role: "MAFIA" } }),
        GamePlayer.count({ where: { role: "DOCTOR" } }),
        GamePlayer.count({ where: { role: "OFFICER" } }),
        GamePlayer.count({ where: { role: { [Op.in]: ["VILLAGER", "CITIZEN"] } } }),
        GamePlayer.count({ where: { role: "MAFIA", team: "MAFIA" } }), // placeholder for win check
        GamePlayer.count({ where: { team: "VILLAGE" } })
      ]);

      // Team wins
      const mafiaTeamWins = await Game.count({ where: { status: "FINISHED", winnerTeam: "MAFIA" } });
      const villageTeamWins = await Game.count({ where: { status: "FINISHED", winnerTeam: { [Op.in]: ["VILLAGE", "VILLAGERS"] } } });
      const totalFinished = mafiaTeamWins + villageTeamWins;

      res.json({
        success: true,
        roleDistribution: {
          totalAssigned: totalGamePlayers,
          mafia: mafiaCount,
          doctor: doctorCount,
          officer: officerCount,
          villager: villagerCount
        },
        teamPerformance: {
          totalGamesFinished: totalFinished,
          mafiaWins: mafiaTeamWins,
          villageWins: villageTeamWins,
          mafiaWinRate: totalFinished > 0 ? Math.round((mafiaTeamWins / totalFinished) * 100) : 0,
          villageWinRate: totalFinished > 0 ? Math.round((villageTeamWins / totalFinished) * 100) : 0
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /* ─────────────────────────────────────────────────────────────
     7. AUDIT LOGS
     ───────────────────────────────────────────────────────────── */

  // GET /api/admin/audit
  router.get("/audit", async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
      const offset = (page - 1) * limit;

      const action = req.query.action;
      const targetType = req.query.targetType;

      const where = {};
      if (action) where.action = action;
      if (targetType) where.targetType = targetType;

      const { count, rows } = await AdminAuditLog.findAndCountAll({
        where,
        order: [["createdAt", "DESC"]],
        limit,
        offset
      });

      res.json({
        success: true,
        logs: rows,
        pagination: {
          total: count,
          page,
          limit,
          totalPages: Math.ceil(count / limit)
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /* ─────────────────────────────────────────────────────────────
     8. SYSTEM HEALTH
     ───────────────────────────────────────────────────────────── */

  // GET /api/admin/system
  router.get("/system", async (req, res) => {
    try {
      // Test DB latency
      const dbStart = Date.now();
      let dbConnected = false;
      let dbLatencyMs = 0;
      try {
        await User.findOne({ attributes: ["id"], limit: 1 });
        dbConnected = true;
        dbLatencyMs = Date.now() - dbStart;
      } catch (err) {
        dbConnected = false;
      }

      const memory = process.memoryUsage();
      const connectedSockets = io ? io.engine?.clientsCount || 0 : 0;
      const activeGamesCount = roomManager?.games?.size || 0;

      res.json({
        success: true,
        health: {
          serverStatus: "HEALTHY",
          nodeVersion: process.version,
          platform: process.platform,
          uptimeSeconds: Math.floor(process.uptime()),
          environment: process.env.NODE_ENV || "production",
          port: process.env.PORT || 4090,
          timestamp: new Date().toISOString()
        },
        database: {
          status: dbConnected ? "CONNECTED" : "DISCONNECTED",
          latencyMs: dbLatencyMs,
          dialect: "mysql"
        },
        socket: {
          status: io ? "RUNNING" : "NOT_AVAILABLE",
          connectedSockets,
          activeRoomsCount: activeGamesCount
        },
        memory: {
          rssMb: Math.round(memory.rss / (1024 * 1024)),
          heapTotalMb: Math.round(memory.heapTotal / (1024 * 1024)),
          heapUsedMb: Math.round(memory.heapUsed / (1024 * 1024))
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /* ─────────────────────────────────────────────────────────────
     9. EXPORT DATA (CSV)
     ───────────────────────────────────────────────────────────── */

  // GET /api/admin/export/:entity
  router.get("/export/:entity", async (req, res) => {
    try {
      const entity = req.params.entity?.toLowerCase();
      let csv = "";
      let filename = `export_${entity}_${Date.now()}.csv`;

      if (entity === "users") {
        const users = await User.findAll({
          attributes: ["id", "displayName", "email", "role", "isBlocked", "isOnline", "gamesPlayed", "gamesWon", "gamesLost", "createdAt"],
          order: [["createdAt", "DESC"]],
          limit: 1000
        });

        csv = "ID,Display Name,Email,Role,Blocked,Online,Games Played,Games Won,Games Lost,Created At\n";
        for (const u of users) {
          csv += `"${u.id}","${u.displayName}","${u.email}","${u.role}",${u.isBlocked},${u.isOnline},${u.gamesPlayed},${u.gamesWon},${u.gamesLost},"${u.createdAt}"\n`;
        }
      } else if (entity === "audit") {
        const logs = await AdminAuditLog.findAll({
          order: [["createdAt", "DESC"]],
          limit: 1000
        });

        csv = "ID,Admin Email,Action,Target Type,Target ID,Status,IP Address,Created At\n";
        for (const l of logs) {
          csv += `"${l.id}","${l.adminEmail}","${l.action}","${l.targetType || ""}","${l.targetId || ""}","${l.status}","${l.ipAddress || ""}","${l.createdAt}"\n`;
        }
      } else if (entity === "games") {
        const games = await Game.findAll({
          order: [["createdAt", "DESC"]],
          limit: 1000
        });

        csv = "ID,Room ID,Status,Winner,Started At,Ended At\n";
        for (const g of games) {
          csv += `"${g.id}","${g.roomId || ""}","${g.status}","${g.winnerTeam || ""}","${g.startedAt || ""}","${g.endedAt || ""}"\n`;
        }
      } else {
        return res.status(400).json({ success: false, error: "Invalid export entity (users, audit, games)" });
      }

      await logAdminAction({
        adminUser: req.user,
        action: "EXPORT_DATA",
        targetType: "EXPORT",
        targetId: entity,
        details: { entity, filename },
        req
      });

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.send(csv);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /* ─────────────────────────────────────────────────────────────
     10. PLATFORM DEFAULT RULES
     ───────────────────────────────────────────────────────────── */

  let platformRules = { ...DEFAULT_GAME_RULES };

  // GET /api/admin/rules
  router.get("/rules", requireAuth, requireSuperAdmin, (_req, res) => {
    res.json({ success: true, rules: platformRules });
  });

  // PUT /api/admin/rules
  router.put("/rules", requireAuth, requireSuperAdmin, async (req, res) => {
    try {
      const updates = req.body;
      if (!updates || typeof updates !== "object") {
        return res.status(400).json({ success: false, error: "Rules payload required" });
      }

      platformRules = {
        ...DEFAULT_GAME_RULES,
        ...updates,
        timers: { ...DEFAULT_GAME_RULES.timers, ...(updates.timers || {}) },
        doctor: { ...DEFAULT_GAME_RULES.doctor, ...(updates.doctor || {}) },
        voting: { ...DEFAULT_GAME_RULES.voting, ...(updates.voting || {}) },
        mafia: { ...DEFAULT_GAME_RULES.mafia, ...(updates.mafia || {}) }
      };

      await logAdminAction({
        adminUser: req.user,
        action: "UPDATE_PLATFORM_RULES",
        targetType: "PLATFORM",
        targetId: "rules",
        details: { rules: platformRules },
        req
      });

      res.json({ success: true, rules: platformRules });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /api/admin/games/:id/replay
  router.get("/games/:id/replay", requireAuth, requireSuperAdmin, async (req, res) => {
    try {
      const game = await Game.findByPk(req.params.id);
      if (!game) {
        return res.status(404).json({ success: false, error: "Game not found" });
      }
      res.json({
        success: true,
        replay: game.finalStateSnapshot || null,
        timeline: game.timeline || [],
        rulesSnapshot: game.rulesSnapshot || null,
        winnerTeam: game.winnerTeam,
        startedAt: game.startedAt,
        endedAt: game.endedAt
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /api/admin/public-rooms
  router.get("/public-rooms", requireAuth, requireSuperAdmin, (_req, res) => {
    try {
      const publicRooms = typeof roomManager?.getPublicRooms === "function" ? roomManager.getPublicRooms() : [];
      res.json({ success: true, rooms: publicRooms });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}
