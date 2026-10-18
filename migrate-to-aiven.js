/**
 * migrate-to-aiven.js  (v3 - NULL-safe copy + DROP+ADD unique keys)
 * Run from PROJECT ROOT:  node migrate-to-aiven.js
 */
const mysql = require("mysql2/promise");

// ================= EDIT (password only!) =================
const LOCAL = {
  host: "127.0.0.1", port: 3306, user: "root",
  password: "Aung@3520",                    // local root password ("" if none)
  database: "canteen_db",
};
const AIVEN = {
  host: "canteen-mysql-canteen-payment.g.aivencloud.com",
  port: 24613, user: "avnadmin",
  password: "YOUR_AIVEN_PASSWORD_HERE",   // <-- ONLY EDIT THIS
  database: "canteen_db",
};
// =========================================================

const G = "\x1b[32m", R = "\x1b[31m", C = "\x1b[36m", Y = "\x1b[33m", X = "\x1b[0m";

// v3 FIX 1: null check FIRST (JS quirk: typeof null === "object"!)
function clean(v) {
  if (v === null || v === undefined) return null;
  if (Buffer.isBuffer(v)) return v;
  if (v instanceof Date) return v;
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

async function main() {
  console.log(`${C}[1/5] Connecting to LOCAL (canteen_db)...${X}`);
  const local = await mysql.createConnection(LOCAL);
  console.log(`${G}  OK${X}`);
  const [tablesRes] = await local.query("SHOW TABLES");
  const tables = tablesRes.map((r) => Object.values(r)[0]);
  console.log(`  Tables: ${tables.join(", ")}`);

  console.log(`${C}[2/5] Connecting to AIVEN...${X}`);
  const { database: dbName, ...opts } = AIVEN;
  const aiven = await mysql.createConnection({
    ...opts,
    ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
    connectTimeout: 15000,
  });
  console.log(`${G}  OK${X}`);

  console.log(`${C}[3/5] Creating database "${dbName}"...${X}`);
  await aiven.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
  await aiven.query(`USE \`${dbName}\``);
  await aiven.query("SET SESSION sql_mode='NO_ENGINE_SUBSTITUTION'");
  await aiven.query("SET FOREIGN_KEY_CHECKS=0");

  console.log(`${C}[4/5] Copying tables (NULL-safe)...${X}`);
  const uniqueKeys = {}, counts = {};
  for (const t of tables) {
    process.stdout.write(`  -> ${t} ... `);
    const [ddlRows] = await local.query(`SHOW CREATE TABLE \`${t}\``);
    const ddl = ddlRows[0]["Create Table"];

    uniqueKeys[t] = [];
    let m; const re = /UNIQUE KEY `([^`]+)` \(([^)]+)\)/g;
    while ((m = re.exec(ddl)) !== null) uniqueKeys[t].push({ name: m[1], cols: m[2] });
    await aiven.query(`DROP TABLE IF EXISTS \`${t}\``);
    await aiven.query(ddl.replace(/UNIQUE KEY/g, "KEY"));

    const [rows] = await local.query(`SELECT * FROM \`${t}\``);
    counts[t] = rows.length;
    if (rows.length) {
      const cols = Object.keys(rows[0]);
      const colList = cols.map((c) => `\`${c}\``).join(", ");
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        const ph = chunk.map(() => `(${cols.map(() => "?").join(",")})`).join(",");
        const vals = chunk.flatMap((row) => cols.map((c) => clean(row[c])));
        await aiven.query(`INSERT INTO \`${t}\` (${colList}) VALUES ${ph}`, vals);
      }
    }
    console.log(`${G}${rows.length} rows${X}`);
  }

  console.log(`${C}[5/5] Applying UNIQUE keys...${X}`);
  for (const t of tables) {
    for (const uk of uniqueKeys[t]) {
      try {
        // v3 FIX 2: drop the plain index first, THEN add unique (same name!)
        await aiven.query(
          `ALTER TABLE \`${t}\` DROP INDEX \`${uk.name}\`, ADD UNIQUE KEY \`${uk.name}\` (${uk.cols})`
        );
        console.log(`  ${t}.${uk.name}: ${G}OK${X}`);
      } catch (e) {
        console.log(`  ${t}.${uk.name}: ${R}CONFLICT - ${e.message}${X}`);
        try {
          const [dups] = await aiven.query(
            `SELECT ${uk.cols}, COUNT(*) AS n FROM \`${t}\` GROUP BY ${uk.cols} HAVING n > 1 LIMIT 10`
          );
          dups.forEach((d) => console.log(`    ${Y}duplicate: ${JSON.stringify(d)}${X}`));
        } catch {}
      }
    }
  }

  await aiven.query("SET FOREIGN_KEY_CHECKS=1");
  console.log(`${C}Verifying row counts...${X}`);
  let allOk = true;
  for (const t of tables) {
    const [[r]] = await aiven.query(`SELECT COUNT(*) AS c FROM \`${t}\``);
    const ok = r.c === counts[t];
    if (!ok) allOk = false;
    console.log(`  ${t}: local=${counts[t]} aiven=${r.c} ${ok ? G + "OK" + X : R + "MISMATCH" + X}`);
  }
  await local.end();
  await aiven.end();
  console.log(allOk
    ? `${G}MIGRATION COMPLETE! Restart your app and test login.${X}`
    : `${Y}Report any MISMATCH/CONFLICT lines to me.${X}`);
}

main().catch((e) => {
  console.error(`${R}FAILED: ${e.code || ""} ${e.message}${X}`);
  if (e.code === "ER_ACCESS_DENIED_ERROR") console.error("Wrong AIVEN password in config.");
  process.exit(1);
});