// One-off page render check with an authenticated session.
// Server-rendered HTML only shows the pre-hydration state, so client-rendered
// widgets (QR image, dashboard data) are asserted via their SSR placeholders.
const BASE = "http://127.0.0.1:3000";
let cookie = "";
async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    if (pair.startsWith("canteen_session=")) cookie = pair;
  }
  return res;
}
const html = async (path) => (await req("GET", path)).text();

await req("POST", "/api/auth/login", { id: "S001", pin: "123456" });
const student = await html("/student");
const card = await html("/student/id-card");
const hist = await html("/student/transactions");
console.log("student page has balance:", student.includes("Current balance"), "| has QR heading:", student.includes("My payment QR"));
console.log("id-card page has front/back:", card.includes("Front") && card.includes("Back"), "| has watermark COPY:", card.includes("COPY"));
console.log("history page has table:", hist.includes("Transaction history"));

cookie = "";
await req("POST", "/api/auth/login", { id: "C001", pin: "123456" });
const cashier = await html("/cashier");
console.log("cashier page has scanner:", cashier.includes("Scan student pass"));

cookie = "";
await req("POST", "/api/auth/login", { id: "A001", pin: "123456" });
const admin = await html("/admin");
console.log("admin page renders dashboard (SSR placeholder):", admin.includes("Administration") && admin.includes("Loading dashboard"));

cookie = "";
const anon = await req("GET", "/student");
console.log("anonymous /student redirects:", anon.status === 307 || anon.status === 302);

const login = await html("/login");
console.log("unified login (no role tabs):", login.includes("Sign in") && !login.includes('Student</button>') && !login.includes(">Cashier<"));
