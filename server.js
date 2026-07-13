const express = require("express");
const app = express();
const shortid = require("shortid");
const crypto = require("crypto");

app.use(express.static("public"));
app.use(express.json());

const usersDB = new Map();
const urlDatabase = new Map();
const analyticsDB = new Map();

// Default admin
usersDB.set("admin", { username: "admin", password: "admin123", createdAt: new Date().toISOString() });

const FACEBOOK_BOTS = ["facebookexternalhit", "facebookbot", "facebot"];
const GOOGLE_BOTS = ["googlebot", "googlebot-image", "adsbot-google", "mediapartners-google"];
const ALL_BOTS = ["twitterbot", "linkedinbot", "whatsapp", "telegrambot", "discordbot","slackbot", "pinterest", "redditbot", "snapchat", "instagram","bingbot", "yahooslurp", "duckduckbot", "baiduspider", "yandexbot","scraper", "crawler", "spider", "curl", "wget", "headless","selenium", "puppeteer", "playwright", "python-requests", "node-fetch", "axios"];

const tokensDB = new Map();

function generateToken() { return crypto.randomBytes(32).toString("hex"); }

function authMiddleware(req, res, next) {
  const token = req.headers["authorization"];
  if (!token || !tokensDB.has(token)) return res.status(401).json({ error: "Login required" });
  req.user = tokensDB.get(token);
  next();
}

function detectBot(req) {
  const ua = (req.headers["user-agent"] || "").toLowerCase();
  const ref = (req.headers["referer"] || "").toLowerCase();
  const acceptLang = req.headers["accept-language"];
  
  for (let bot of FACEBOOK_BOTS) { if (ua.includes(bot)) return { type: "facebook", isBot: true, confidence: 99 }; }
  for (let bot of GOOGLE_BOTS) { if (ua.includes(bot)) return { type: "google", isBot: true, confidence: 98 }; }
  for (let bot of ALL_BOTS) { if (ua.includes(bot)) return { type: "other_bot", isBot: true, confidence: 85 }; }
  if (!acceptLang && ua.length < 35) return { type: "suspicious", isBot: true, confidence: 60 };
  return { type: "human", isBot: false, confidence: 95 };
}

function getDevice(ua) {
  if (ua.includes("Mobile") || ua.includes("Android")) return "Mobile";
  if (ua.includes("Tablet") || ua.includes("iPad")) return "Tablet";
  return "Desktop";
}

function getBrowser(ua) {
  if (ua.includes("Chrome") && !ua.includes("Edg")) return "Chrome";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
  if (ua.includes("Edg")) return "Edge";
  if (ua.includes("OPR") || ua.includes("Opera")) return "Opera";
  return "Other";
}

function getOS(ua) {
  if (ua.includes("Windows")) return "Windows";
  if (ua.includes("Mac")) return "macOS";
  if (ua.includes("Linux") && !ua.includes("Android")) return "Linux";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
  return "Unknown";
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

// CREATE LINK
app.post("/api/create", authMiddleware, (req, res) => {
  const { offerPage, alias } = req.body;
  if (!offerPage || !offerPage.startsWith("http")) return res.json({ error: "Valid URL required" });
  const code = alias || shortid.generate();
  if (urlDatabase.has(code)) return res.json({ error: "Alias taken" });
  
  urlDatabase.set(code, { code, offerPage, owner: req.user, active: true, created: new Date().toISOString() });
  analyticsDB.set(code, {
    total: 0, humans: 0, bots: 0, facebook: 0, google: 0, other_bot: 0,
    devices: { Mobile: 0, Desktop: 0, Tablet: 0 },
    browsers: { Chrome: 0, Firefox: 0, Safari: 0, Edge: 0, Opera: 0, Other: 0 },
    os: { Windows: 0, macOS: 0, Linux: 0, Android: 0, iOS: 0, Unknown: 0 },
    hourlyClicks: {}, dailyClicks: {},
    logs: []
  });
  res.json({ success: true, shortUrl: `https://${req.get("host")}/${code}`, code });
});

// REDIRECT
app.get("/:code", (req, res) => {
  const data = urlDatabase.get(req.params.code);
  if (!data || !data.active) return res.send("<h1>Link not found</h1>");
  
  const ua = req.headers["user-agent"] || "";
  const visitor = detectBot(req);
  const stats = analyticsDB.get(req.params.code);
  
  stats.total++;
  const hour = new Date().getHours();
  stats.hourlyClicks[hour] = (stats.hourlyClicks[hour] || 0) + 1;
  const day = new Date().toLocaleDateString();
  stats.dailyClicks[day] = (stats.dailyClicks[day] || 0) + 1;
  
  if (visitor.isBot) {
    stats.bots++;
    if (visitor.type === "facebook") stats.facebook++;
    else if (visitor.type === "google") stats.google++;
    else stats.other_bot++;
    stats.logs.push({ type: visitor.type, isBot: true, confidence: visitor.confidence, time: new Date().toISOString(), ua: ua.substring(0,100) });
    if (stats.logs.length > 200) stats.logs = stats.logs.slice(-200);
    
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta property="og:title" content="Safe Link"><meta property="og:description" content="Verified safe link"><meta property="og:url" content="${data.offerPage}"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Safe Link</title><style>body{font-family:Arial;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f5f5f5;margin:0}.page{background:white;padding:40px;border-radius:20px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,0.1);max-width:500px;margin:20px}.icon{font-size:60px}h1{color:#333;font-size:24px}p{color:#666;margin:15px 0}.link{display:inline-block;background:#4CAF50;color:white;padding:14px 35px;text-decoration:none;border-radius:30px;font-weight:bold;font-size:16px;margin-top:10px}.badge{background:#4CAF50;color:white;padding:6px 18px;border-radius:20px;font-size:12px}</style></head><body><div class="page"><div class="icon">✅</div><span class="badge">Verified Safe</span><h1>Safe Content Page</h1><p>This link is verified and safe. Click below to access the content.</p><a href="${data.offerPage}" class="link">Access Content →</a></div></body></html>`);
  } else {
    stats.humans++;
    const device = getDevice(ua);
    const browser = getBrowser(ua);
    const os = getOS(ua);
    stats.devices[device] = (stats.devices[device] || 0) + 1;
    stats.browsers[browser] = (stats.browsers[browser] || 0) + 1;
    stats.os[os] = (stats.os[os] || 0) + 1;
    stats.logs.push({ type: "human", isBot: false, device, browser, os, time: new Date().toISOString(), ua: ua.substring(0,100) });
    if (stats.logs.length > 200) stats.logs = stats.logs.slice(-200);
    res.redirect(data.offerPage);
  }
});

// MY LINKS
app.get("/api/mylinks", authMiddleware, (req, res) => {
  const myLinks = [];
  for (let [code, data] of urlDatabase) {
    if (data.owner === req.user) {
      const stats = analyticsDB.get(code) || {};
      myLinks.push({
        code: data.code, offerPage: data.offerPage, created: data.created,
        active: data.active, totalClicks: stats.total || 0,
        humanClicks: stats.humans || 0, botClicks: stats.bots || 0
      });
    }
  }
  res.json({ links: myLinks.reverse() });
});

// FULL ANALYTICS
app.get("/api/analytics/:code", authMiddleware, (req, res) => {
  const data = urlDatabase.get(req.params.code);
  if (!data) return res.json({ error: "Not found" });
  if (data.owner !== req.user) return res.json({ error: "Not your link" });
  const stats = analyticsDB.get(req.params.code);
  
  const total = stats.total || 0;
  res.json({
    link: data,
    overview: {
      totalClicks: total,
      humanClicks: stats.humans || 0,
      botClicks: stats.bots || 0,
      humanRate: total > 0 ? Math.round((stats.humans/total)*100) : 0,
      botRate: total > 0 ? Math.round((stats.bots/total)*100) : 0,
      fbBots: stats.facebook || 0,
      googleBots: stats.google || 0,
      otherBots: stats.other_bot || 0
    },
    devices: stats.devices || {},
    browsers: stats.browsers || {},
    os: stats.os || {},
    hourly: stats.hourlyClicks || {},
    daily: stats.dailyClicks || {},
    recentLogs: (stats.logs || []).slice(-30).reverse()
  });
});

// DELETE LINK
app.delete("/api/delete/:code", authMiddleware, (req, res) => {
  const data = urlDatabase.get(req.params.code);
  if (!data) return res.json({ error: "Not found" });
  if (data.owner !== req.user) return res.json({ error: "Not your link" });
  urlDatabase.delete(req.params.code);
  analyticsDB.delete(req.params.code);
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("✅ Pro System Ready!"));
