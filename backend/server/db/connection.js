// backend/server/db/connection.js
import { Sequelize } from "sequelize";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../../.env") });

const sequelize = new Sequelize(process.env.MYSQL_DATABASE, process.env.MYSQL_USER, process.env.MYSQL_PASSWORD, {
  host: process.env.MYSQL_HOST,

  port: process.env.MYSQL_PORT,

  dialect: "mysql",

  logging: false,

  pool: { max: 10, min: 0, acquire: 30000, idle: 10000 }
});

export default sequelize;
