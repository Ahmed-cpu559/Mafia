// backend/server/db/models/AdminAuditLog.js
import { DataTypes } from "sequelize";
import sequelize from "../connection.js";

const AdminAuditLog = sequelize.define(
  "AdminAuditLog",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },

    adminUserId: { type: DataTypes.UUID, allowNull: true },

    adminEmail: { type: DataTypes.STRING, allowNull: false },

    action: { type: DataTypes.STRING, allowNull: false },

    targetType: { type: DataTypes.STRING, allowNull: true },

    targetId: { type: DataTypes.STRING, allowNull: true },

    details: { type: DataTypes.JSON, allowNull: true },

    ipAddress: { type: DataTypes.STRING, allowNull: true },

    userAgent: { type: DataTypes.STRING, allowNull: true },

    status: { type: DataTypes.ENUM("SUCCESS", "FAILED"), defaultValue: "SUCCESS" }
  },
  {
    timestamps: true,
    tableName: "admin_audit_logs",
    indexes: [
      { fields: ["adminUserId"] },
      { fields: ["action"] },
      { fields: ["targetType"] },
      { fields: ["createdAt"] }
    ]
  }
);

export default AdminAuditLog;
