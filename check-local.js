// check-local.js — Run: node check-local.js
const mysql = require("mysql2/promise");

const LOCAL = {
  host: "127.0.0.1",
  port: 3306,          // XAMPP ဆိုရင် တခါတလေ 3307 ဖြစ်နိုင်တယ်
  user: "root",
  password: "Aung@3520",        // <-- local MySQL root password ("" if none)
};

mysql.createConnection(LOCAL)
  .then(async (c) => {
    const [rows] = await c.query("SHOW DATABASES");
    console.log("\n=== Databases on LOCAL MySQL (127.0.0.1:" + LOCAL.port + ") ===");
    rows.forEach((r) => console.log("  -", r.Database));
    await c.end();
  })
  .catch((e) => {
    console.error("FAILED:", e.code, e.message);
    if (e.code === "ER_ACCESS_DENIED_ERROR")
      console.error("-> Wrong local root password! Fill LOCAL.password above.");
    if (e.code === "ECONNREFUSED")
      console.error("-> Local MySQL not running! Start XAMPP MySQL / MySQL80 service.");
  });