// backend/server/db/models/Room.js
import { DataTypes } from "sequelize";
import sequelize from "../connection.js";

const Room = sequelize.define(
  "Room",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },

    code: { type: DataTypes.STRING(10), allowNull: false, unique: true },

    status: { type: DataTypes.ENUM("WAITING_FOR_PLAYERS", "ROLE_ASSIGNMENT", "PLAYING", "FINISHED", "CANCELLED"), defaultValue: "WAITING_FOR_PLAYERS" },

    maxPlayers: { type: DataTypes.INTEGER, defaultValue: 40 },

    minPlayers: { type: DataTypes.INTEGER, defaultValue: 4 },

    visibility: {
      type: DataTypes.ENUM("PUBLIC", "PRIVATE", "INVITE_ONLY"),
      defaultValue: "PUBLIC"
    },

    inviteToken: {
      type: DataTypes.STRING(64),
      allowNull: true
    },

    rules: {
      type: DataTypes.JSON,
      allowNull: true
    }
  },
  { timestamps: true, tableName: "rooms" }
);

export default Room;
