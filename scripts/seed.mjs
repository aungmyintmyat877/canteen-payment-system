#!/usr/bin/env node
// ============================================================================
// Seed script — creates the database/tables from schema.sql (idempotent) and
// inserts demo staff & students. Run: npm run seed
//
// Re-seeding does NOT overwrite balances, PINs or qr_secrets of students that
// already exist, so it is safe to run repeatedly.
// All demo PINs are 123456.
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";

// Load .env.local without extra dependencies
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const DB = process.env.MYSQL_DATABASE || "canteen_system";

const students = [
  // id, name, year, initial balance (minor units), photo, phone, email, major, class
  ["S001", "Aditya Pratama", 2023, 25000, "/avatars/s001.svg", "+62 812 1111 0001", "aditya@student.example.edu", "Computer Science", "CS-2A"],
  ["S002", "Bunga Salsabila", 2022, 10000, "/avatars/s002.svg", "+62 812 1111 0002", "bunga@student.example.edu", "Economics", "EC-1B"],
  ["S003", "Chen Wei", 2024, 5000, "/avatars/s003.svg", "+62 812 1111 0003", "chen.wei@student.example.edu", "Mechanical Engineering", "ME-3C"],
  ["S004", "Dewi Anggraini", 2021, 0, "/avatars/s004.svg", "+62 812 1111 0004", "dewi@student.example.edu", "Medicine", "MD-4A"],
  ["S005", "Farhan Maulana", 2025, 0, "/avatars/s005.svg", "+62 812 1111 0005", "farhan@student.example.edu", "Law", "LW-1D"],
];

const staff = [
  ["C001", "Rina Kartika", "cashier"],
  ["A001", "Dr. Bimo Santoso", "admin"],
];

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    multipleStatements: true,
    charset: "utf8mb4",
  });

  console.log(`Ensuring schema in database "${DB}" ...`);
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${DB}\``);

  const schemaPath = path.join(process.cwd(), "schema.sql");
  await conn.query(fs.readFileSync(schemaPath, "utf8"));

  const pinHash = await bcrypt.hash("123456", 10);

  for (const [id, name, year, balance, photo, phone, email, major, className] of students) {
    const qrSecret = crypto.randomBytes(16).toString("hex"); // 32 hex chars
    await conn.execute(
      `INSERT INTO students (id, name, year, pin_hash, balance, qr_secret, photo_url, phone, email, major, class_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name), year = VALUES(year), photo_url = VALUES(photo_url),
         phone = VALUES(phone), email = VALUES(email), major = VALUES(major), class_name = VALUES(class_name)`,
      [id, name, year, pinHash, balance, qrSecret, photo, phone, email, major, className]
    );
  }

  for (const [id, name, role] of staff) {
    await conn.execute(
      `INSERT INTO staff (id, name, role, pin_hash) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), role = VALUES(role)`,
      [id, name, role, pinHash]
    );
  }

  await conn.end();

  console.log("Seed complete.\n");
  console.log("Demo accounts (all PINs: 123456):");
  console.log("  Students : S001..S005            -> /student");
  console.log("  Cashier  : C001 (Rina Kartika)   -> /cashier");
  console.log("  Admin    : A001 (Dr. Bimo S.)    -> /admin");
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  console.error("Check that MySQL is running and .env.local credentials are correct.");
  process.exit(1);
});
