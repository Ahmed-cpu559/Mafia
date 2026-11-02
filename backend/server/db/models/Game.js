// backend/server/db/models/Game.js
import { DataTypes } from "sequelize";
import sequelize from "../connection.js";

const Game = sequelize.define(
  "Game",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },

    status: { type: DataTypes.ENUM("STARTING", "IN_PROGRESS", "FINISHED", "CANCELLED"), defaultValue: "STARTING" },

    winnerTeam: { type: DataTypes.STRING, allowNull: true },

    startedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },

    endedAt: { type: DataTypes.DATE, allowNull: true },

    finalStateSnapshot: { type: DataTypes.JSON, allowNull: true },

    timeline: { type: DataTypes.JSON, allowNull: true },

    rulesSnapshot: { type: DataTypes.JSON, allowNull: true }
  },
  { timestamps: true, tableName: "games" }
);

export default Game;
