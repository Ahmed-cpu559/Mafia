// backend/server/db/index.js
import sequelize from "./connection.js";

import User from "./models/User.js";
import Room from "./models/Room.js";
import RoomPlayer from "./models/RoomPlayer.js";
import Game from "./models/Game.js";
import GamePlayer from "./models/GamePlayer.js";
import AdminAuditLog from "./models/AdminAuditLog.js";

// Setup Associations
// User <-> Room (Owner)
User.hasMany(Room, { foreignKey: "ownerId", as: "ownedRooms" });
Room.belongsTo(User, { foreignKey: "ownerId", as: "owner" });

// Room <-> User (RoomPlayers)
Room.belongsToMany(User, { through: RoomPlayer, as: "players" });
User.belongsToMany(Room, { through: RoomPlayer, as: "rooms" });

Room.hasMany(RoomPlayer);
RoomPlayer.belongsTo(Room);

User.hasMany(RoomPlayer);
RoomPlayer.belongsTo(User);

// Room <-> Game
Room.hasMany(Game, { foreignKey: "roomId" });
Game.belongsTo(Room, { foreignKey: "roomId" });

// Game <-> User (GamePlayers)
Game.belongsToMany(User, { through: GamePlayer, as: "players" });
User.belongsToMany(Game, { through: GamePlayer, as: "games" });

Game.hasMany(GamePlayer);
GamePlayer.belongsTo(Game);

User.hasMany(GamePlayer);
GamePlayer.belongsTo(User);

// User <-> AdminAuditLog
User.hasMany(AdminAuditLog, { foreignKey: "adminUserId", as: "auditLogs" });
AdminAuditLog.belongsTo(User, { foreignKey: "adminUserId", as: "admin" });

// Export models
export const models = { User, Room, RoomPlayer, Game, GamePlayer, AdminAuditLog };

// Sync database if MY_SQL_ALTER is true
if (process.env.MY_SQL_ALTER === "true") {
  sequelize
    .sync()
    .then(() => {
      console.log("✅ Database schemas synchronized.");
    })
    .catch((err) => {
      console.error("❌ Database sync failed:", err.message);
    });
}

export default sequelize;
