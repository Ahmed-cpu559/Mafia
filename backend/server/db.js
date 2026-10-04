import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from the .env file in the backend directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

// Create a connection pool to the database
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: process.env.MYSQL_PORT,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test the connection
export async function connectDB() {
  try {
    const connection = await pool.getConnection();
    console.log(`✅ Successfully connected to MySQL database: ${process.env.MYSQL_DATABASE}`);
    connection.release();
  } catch (error) {
    console.error('❌ Failed to connect to the database:', error.message);
  }
}

export default pool;
