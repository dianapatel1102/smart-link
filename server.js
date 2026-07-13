const express = require("express");
const app = express();
const shortid = require("shortid");
const crypto = require("crypto");

app.use(express.static("public"));
app.use(express.json());

// User Database
const usersDB = new Map();
// Link Database with owner
const urlDatabase = new Map();
const analyticsDB = new Map();

// Default admin user
usersDB.set("admin", {
  username: "admin",
  password: "admin123",
  createdAt: new Date().toISOString()
});

// Bot Lists
const FACEBOOK_BOTS = ["facebookexternalhit", "facebookbot", "facebot"];
const GOOGLE_BOTS = ["googlebot", "googlebot-image", "adsbot-google"];
const ALL_BOTS = ["twitterbot", "linkedinbot", "whatsapp", "telegrambot", "scraper", "crawler", "spider", "curl", "wget", "headless", "selenium", "puppeteer"];

// Simple token system
const tokensDB = new Map();

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

function authMiddleware(req, res, next) {
  const token = req.headers["authorization"];
  if (!token || !tokensDB.has(token)) {
    return res.status(401).json({ error: "Login required" });
  }
  req.user = tokensDB.get(token);
  next();
}

function detectBot(req) {
  const ua = (req.headers["user-agent"] || "").toLowerCase();
  for (let bot of FACEBOOK_BOTS) { if (ua.includes(bot)) return { type: "facebook", isBot: true }; }
  for (let bot of GOOGLE_BOTS) { if (ua.includes(bot)) return { type: "google", isBot: true }; }
  for (let bot of ALL_BOTS) { if (ua.includes(bot)) return { type: "other_bot", isBot: true }; }
  return { type: "human", isBot: false };
}

// REGISTER
app.post("/api/register", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ error: "Username and password required" });
  if (usersDB.has(username)) return res.json({ error: "Username already exists" });
  if (username.length < 3 || password.length < 4) return res.json({ error: "Min 3 char username, 4 char password" });
  
  usersDB.set(username, { username, password, createdAt: new Date().toISOString() });
  const token = generateToken();
  tokensDB.set(token, username);
  res.json({ success: true, token, username });
});

// LOGIN
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const user = usersDB.get(username);
  if (!user || user.password !== password) return res.json({ error: "Invalid credentials" });
  const token = generateToken();
  tokensDB.set(token, username);
  res.json({ success: true, token, username });
});

// CREATE LINK (Protected)
app.post("/api/create", authMiddleware, (req, res) => {
  const { offerPage, alias } = req.body;
  if (!offerPage || !offerPage.startsWith("http")) return res.json({ error: "Valid URL required" });
  const code = alias || shortid.generate();
  if (urlDatabase.has(code)) return res.json({ error: "Alias taken" });
  
  urlDatabase.set(code, { code, offerPage, owner: req.user, active: true, created: new Date().toISOString() });
  analyticsDB.set(code, { total: 0, humans: 0, bots: 0, facebook: 0, google: 0, logs: [] });
  res.json({ success: true, shortUrl: `https://${req.get("host")}/${code}`, code });
});

// MY LINKS (Protected)
app.get("/api/mylinks", authMiddleware, (req, res) => {
  const myLinks = [];
  for (let [code, data] of urlDatabase) {
    if (data.owner === req.user) {
      const stats = analyticsDB.get(code);
      myLinks.push({
        code: data.code,
        offerPage: data.offerPage,
        created: data.created,
        active: data.active,
        totalClicks: stats ? stats.total : 0,
        humanClicks: stats ? stats.humans : 0,
        botClicks: stats ? stats.bots : 0
      });
    }
  }
  res.json({ links: myLinks.reverse() });
});

// REDIRECT (Public)
app.get("/:code", (req, res) => {
  const data = urlDatabase.get(req.params.code);
  if (!data || !data.active) return res.send("<h1>Not found</h1>");
  
  const visitor = detectBot(req);
  const stats = analyticsDB.get(req.params.code);
  stats.total++;
  
  if (visitor.isBot) {
    stats.bots++;
    if (visitor.type === "facebook") stats.facebook++;
    if (visitor.type === "google") stats.google++;
    stats.logs.push({ type: visitor.type, sent: "safe", time: new Date().toISOString() });
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta property="og:title" content="Safe Link"><meta property="og:description" content="Verified safe link"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Safe Link</title><style>body{font-family:Arial;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f5f5f5;margin:0}.page{background:white;padding:30px;border-radius:15px;text-align:center;box-shadow:0 5px 20px rgba(0,0,0,0.1);max-width:500px}.icon{font-size:50px}h1{color:#333}p{color:#666;margin:15px 0}.link{display:inline-block;background:#4CAF50;color:white;padding:12px 30px;text-decoration:none;border-radius:25px;font-weight:bold}.badge{background:#4CAF50;color:white;padding:5px 15px;border-radius:15px;font-size:12px}</style></head><body><div class="page"><div class="icon">✅</div><span class="badge">Verified Safe</span><h1>Safe Content Page</h1><p>This link is verified and safe.</p><a href="${data.offerPage}" class="link">Access Content →</a></div></body></html>`);
  } else {
    stats.humans++;
    stats.logs.push({ type: "human", sent: "offer", time: new Date().toISOString() });
    res.redirect(data.offerPage);
  }
});

// STATS (Protected)
app.get("/api/stats/:code", authMiddleware, (req, res) => {
  const data = urlDatabase.get(req.params.code);
  if (!data) return res.json({ error: "Not found" });
  if (data.owner !== req.user) return res.json({ error: "Not your link" });
  const stats = analyticsDB.get(req.params.code);
  res.json({
    link: data,
    stats: stats,
    humanPercent: stats.total > 0 ? Math.round((stats.humans/stats.total)*100) + "%" : "0%",
    botPercent: stats.total > 0 ? Math.round((stats.bots/stats.total)*100) + "%" : "0%"
  });
});

// DELETE LINK (Protected)
app.delete("/api/delete/:code", authMiddleware, (req, res) => {
  const data = urlDatabase.get(req.params.code);
  if (!data) return res.json({ error: "Not found" });
  if (data.owner !== req.user) return res.json({ error: "Not your link" });
  urlDatabase.delete(req.params.code);
  analyticsDB.delete(req.params.code);
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("✅ Ready!"));
