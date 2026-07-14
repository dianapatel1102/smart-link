const express = require("express");
const app = express();
const shortid = require("shortid");
const crypto = require("crypto");

app.use(express.static("public"));
app.use(express.json());

const usersDB = new Map();
const urlDatabase = new Map();
const analyticsDB = new Map();
const tokensDB = new Map();

usersDB.set("admin", { username: "admin", password: "admin123" });

function generateToken() { return crypto.randomBytes(32).toString("hex"); }

function auth(req, res, next) {
  const token = req.headers["authorization"];
  if (!token || !tokensDB.has(token)) return res.status(401).json({ error: "Login required" });
  req.user = tokensDB.get(token);
  next();
}

const BOTS = ["facebookexternalhit","facebookbot","facebot","googlebot","googlebot-image","twitterbot","linkedinbot","whatsapp","telegrambot","scraper","crawler","spider","curl","wget","headless","selenium","puppeteer"];

function detectBot(req) {
  const ua = (req.headers["user-agent"] || "").toLowerCase();
  return BOTS.some(b => ua.includes(b));
}

// REGISTER
app.post("/api/register", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || username.length < 3 || password.length < 4) return res.json({ error: "Min 3/4 chars" });
  if (usersDB.has(username)) return res.json({ error: "Username exists" });
  usersDB.set(username, { username, password });
  const token = generateToken(); tokensDB.set(token, username);
  res.json({ success: true, token, username });
});

// LOGIN
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const user = usersDB.get(username);
  if (!user || user.password !== password) return res.json({ error: "Invalid" });
  const token = generateToken(); tokensDB.set(token, username);
  res.json({ success: true, token, username });
});

// CREATE
app.post("/api/create", auth, (req, res) => {
  const { offerPage, alias } = req.body;
  if (!offerPage?.startsWith("http")) return res.json({ error: "Valid URL required" });
  const code = alias || shortid.generate();
  if (urlDatabase.has(code)) return res.json({ error: "Alias taken" });
  urlDatabase.set(code, { code, offerPage, owner: req.user, active: true, created: new Date() });
  analyticsDB.set(code, { total: 0, humans: 0, bots: 0, logs: [] });
  res.json({ success: true, shortUrl: `https://${req.get("host")}/${code}`, code });
});

// REDIRECT
app.get("/:code", (req, res) => {
  const data = urlDatabase.get(req.params.code);
  if (!data?.active) return res.send("<h1>Not found</h1>");
  const isBot = detectBot(req);
  const stats = analyticsDB.get(req.params.code);
  stats.total++;
  isBot ? stats.bots++ : stats.humans++;
  stats.logs.push({ type: isBot ? "bot" : "human", time: new Date() });
  
  if (isBot) {
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta property="og:title" content="Safe Link"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Safe</title><style>body{font-family:Arial;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f5f5f5;margin:0}.page{background:white;padding:40px;border-radius:20px;text-align:center}h1{color:#333}.link{display:inline-block;background:#4CAF50;color:white;padding:14px 35px;text-decoration:none;border-radius:30px;font-weight:bold;margin-top:15px}</style></head><body><div class="page"><h1>✅ Safe Link</h1><a href="${data.offerPage}" class="link">Access →</a></div></body></html>`);
  } else {
    res.redirect(data.offerPage);
  }
});

// MY LINKS
app.get("/api/mylinks", auth, (req, res) => {
  const myLinks = [];
  for (let [code, data] of urlDatabase) {
    if (data.owner === req.user) {
      const s = analyticsDB.get(code);
      myLinks.push({ code, offerPage: data.offerPage, totalClicks: s?.total || 0, humanClicks: s?.humans || 0, botClicks: s?.bots || 0 });
    }
  }
  res.json({ links: myLinks.reverse() });
});

// DELETE
app.delete("/api/delete/:code", auth, (req, res) => {
  urlDatabase.delete(req.params.code);
  analyticsDB.delete(req.params.code);
  res.json({ success: true });
});

app.listen(process.env.PORT || 3000, () => console.log("✅ Server Ready!"));
