// backend/server/db/models/User.js
import { DataTypes } from "sequelize";
import sequelize from "../connection.js";

const User = sequelize.define(
  "User",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },

    displayName: { type: DataTypes.STRING, allowNull: false },

    email: { type: DataTypes.STRING, allowNull: false, unique: true },

    password: { type: DataTypes.STRING, allowNull: true },

    role: { type: DataTypes.STRING, defaultValue: "PLAYER" },

    isBlocked: { type: DataTypes.BOOLEAN, defaultValue: false },

    isConfirmed: { type: DataTypes.BOOLEAN, defaultValue: true },

    avatar: { type: DataTypes.STRING, allowNull: true },

    authProvider: { type: DataTypes.ENUM("google", "otp", "local"), defaultValue: "local" },

    isOnline: { type: DataTypes.BOOLEAN, defaultValue: false },

    lastActiveAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },

    gamesPlayed: { type: DataTypes.INTEGER, defaultValue: 0 },

    gamesWon: { type: DataTypes.INTEGER, defaultValue: 0 },

    gamesLost: { type: DataTypes.INTEGER, defaultValue: 0 },

    socketId: { type: DataTypes.STRING, allowNull: true }
  },
  { timestamps: true, tableName: "users" }
);

export default User;
