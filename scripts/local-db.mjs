#!/usr/bin/env node
// ============================================================================
// Disposable local MySQL instance for development/demo.
//   node scripts/local-db.mjs start|stop|status
//
// - Data directory: <project>/.local-mysql/data  (isolated, deletable)
// - Port: 3307 (does not clash with an existing MySQL service on 3306)
// - Root password: empty (LOCAL DEV ONLY)
//
// Requires the MySQL Server binaries (adjust MYSQLD_BIN below or set the
// MYSQLD_BIN / MYSQL_ADMIN_BIN environment variables).
// ============================================================================
import net from "node:net";
import { spawn, execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PROJECT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const DATA_DIR = path.join(PROJECT, ".local-mysql", "data");
const LOG_FILE = path.join(PROJECT, ".local-mysql", "mysqld.log");
const PORT = 3307;

const MYSQLD_BIN =
  process.env.MYSQLD_BIN || "C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqld.exe";
const MYSQLADMIN_BIN =
  process.env.MYSQL_ADMIN_BIN || "C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqladmin.exe";

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.setTimeout(1500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return (async function poll() {
    while (Date.now() < deadline) {
      if (await portOpen(port)) return true;
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  })();
}

async function start() {
  if (await portOpen(PORT)) {
    console.log(`A MySQL server is already listening on port ${PORT}. Nothing to do.`);
    return;
  }
  if (!fs.existsSync(DATA_DIR)) {
    console.log("Initializing fresh data directory ...");
    await new Promise((resolve, reject) => {
      execFile(MYSQLD_BIN, ["--initialize-insecure", `--datadir=${DATA_DIR}`], (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve();
      });
    });
  }
  console.log(`Starting MySQL on port ${PORT} (log: ${LOG_FILE}) ...`);
  const out = fs.openSync(LOG_FILE, "a");
  const child = spawn(
    MYSQLD_BIN,
    [`--datadir=${DATA_DIR}`, `--port=${PORT}`, "--mysqlx=OFF", "--console"],
    { detached: true, stdio: ["ignore", out, out] }
  );
  child.unref();

  if (await waitForPort(PORT, 30_000)) {
    console.log(`MySQL is up: mysql -u root -h 127.0.0.1 -P ${PORT}`);
    console.log(`Run \`npm run seed\` to create the schema and demo data.`);
  } else {
    console.error("MySQL did not become ready in 30s — check the log file.");
    process.exitCode = 1;
  }
}

async function stop() {
  if (!(await portOpen(PORT))) {
    console.log(`Nothing listening on port ${PORT}.`);
    return;
  }
  await new Promise((resolve, reject) => {
    execFile(MYSQLADMIN_BIN, ["-u", "root", "-h", "127.0.0.1", `-P`, String(PORT), "shutdown"], (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve();
    });
  });
  console.log("MySQL shut down.");
}

const command = process.argv[2];
if (command === "start") await start();
else if (command === "stop") await stop();
else if (command === "status") console.log((await portOpen(PORT)) ? "running" : "stopped");
else {
  console.log("Usage: node scripts/local-db.mjs start|stop|status");
  process.exitCode = 1;
}
