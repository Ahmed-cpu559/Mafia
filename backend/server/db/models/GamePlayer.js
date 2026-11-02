// backend/server/db/models/GamePlayer.js
import { DataTypes } from "sequelize";
import sequelize from "../connection.js";

const GamePlayer = sequelize.define(
  "GamePlayer",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },

    role: { type: DataTypes.STRING, allowNull: false },

    team: { type: DataTypes.STRING, allowNull: false },

    isAlive: { type: DataTypes.BOOLEAN, defaultValue: true },

    deathRound: { type: DataTypes.INTEGER, allowNull: true },

    deathCause: { type: DataTypes.STRING, allowNull: true }
  },
  { timestamps: true, tableName: "game_players", indexes: [{ unique: true, fields: ["GameId", "UserId"] }] }
);

export default GamePlayer;
