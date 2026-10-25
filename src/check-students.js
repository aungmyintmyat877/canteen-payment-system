// check-students.js  —  run:  node check-students.js
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

// .env.local ကို ကိုယ့်ဘာသာ ဖတ်တယ် (dotenv မလို)
const env = {};
for (const line of fs.readFileSync(path.join(__dirname, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

(async () => {
  try {
    const conn = await mysql.createConnection({
      host: env.MYSQL_HOST,
      port: Number(env.MYSQL_PORT || 3306),
      user: env.MYSQL_USER,
      password: env.MYSQL_PASSWORD,
      database: env.MYSQL_DATABASE,
      ssl: !/^(localhost|127\.)/.test(env.MYSQL_HOST || "") ? { rejectUnauthorized: true } : undefined,
    });
    const [rows] = await conn.query("SELECT * FROM students");
    rows.forEach((r) => { if (r.pin_hash) r.pin_hash = "(hidden)"; });
    console.table(rows);
    await conn.end();
  } catch (e) {
    console.error("DB ERROR:", e.message);
  }
})();