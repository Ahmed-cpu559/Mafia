// backend/server/db/models/RoomPlayer.js
import { DataTypes } from "sequelize";
import sequelize from "../connection.js";

const RoomPlayer = sequelize.define(
  "RoomPlayer",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },

    isReady: { type: DataTypes.BOOLEAN, defaultValue: false },

    connectionStatus: { type: DataTypes.ENUM("ONLINE", "OFFLINE"), defaultValue: "ONLINE" }
  },
  { timestamps: true, tableName: "room_players", indexes: [{ unique: true, fields: ["RoomId", "UserId"] }] }
);

export default RoomPlayer;
