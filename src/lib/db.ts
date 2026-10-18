import mysql from "mysql2/promise";

/**
 * Central MySQL connection pool (mysql2/promise).
 *
 * `bigNumberStrings: true` makes BIGINT columns come back as strings instead
 * of silently losing precision as JS numbers — all money is moved through
 * asNumber() helpers and arithmetic is done on integers inside SQL
 * (`balance = balance - ?`) or on values we just read under a row lock.
 */
function createPool(): mysql.Pool {
  const host = process.env.MYSQL_HOST || "127.0.0.1";
  const isRemote = !["127.0.0.1", "localhost"].includes(host);

  return mysql.createPool({
    host,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "canteen_system",
    waitForConnections: true,
    connectionLimit: 10,
    maxIdle: 10,
    idleTimeout: 60_000,
    queueLimit: 0,
    enableKeepAlive: true,
    charset: "utf8mb4",
    supportBigNumbers: true,
    bigNumberStrings: true,
    ssl: isRemote
      ? { rejectUnauthorized: false, minVersion: "TLSv1.2" }
      : undefined,
  });
}

// Reuse one pool across hot reloads in development.
const globalForDb = globalThis as unknown as { __canteenPool?: mysql.Pool };

export const pool: mysql.Pool = globalForDb.__canteenPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__canteenPool = pool;
}

/**
 * Run `fn` on a dedicated connection inside a MySQL transaction.
 * Commits on success, rolls back on any thrown error, always releases the
 * connection. Every balance mutation in this app runs through here.
 */
export async function withTransaction<T>(
  fn: (conn: mysql.PoolConnection) => Promise<T>
): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      // connection already broken — nothing left to roll back
    }
    throw err;
  } finally {
    conn.release();
  }
}

/** BIGINT columns arrive as strings when bigNumberStrings is enabled. */
export function asNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function asString(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}