const express = require("express");
const app = express();
const shortid = require("shortid");
const crypto = require("crypto");
const { MongoClient } = require("mongodb");

// ⚠️⚠️⚠️ YAHAN APNA MONGODB URL PASTE KARO ⚠️⚠️⚠️
const MONGO_URL = "mongodb+srv://admin:<db_admin123>@cluster0.60dtpq0.mongodb.net/?appName=Cluster0";

app.use(express.static("public"));
app.use(express.json());

const client = new MongoClient(MONGO_URL);
let db, usersCol, linksCol, analyticsCol;

async function connectDB() {
  await client.connect();
  db = client.db("smartlink");
  usersCol = db.collection("users");
  linksCol = db.collection("links");
  analyticsCol = db.collection("analytics");
  
  // Default admin
  const admin = await usersCol.findOne({ username: "admin" });
  if (!admin) {
    await usersCol.insertOne({ username: "admin", password: "admin123", createdAt: new Date() });
  }
  console.log("✅ MongoDB Connected! Data permanent hai ab!");
}
connectDB();

const tokensDB = new Map();
function generateToken() { return crypto.randomBytes(32).toString("hex"); }

function auth(req, res, next) {
  const token = req.headers["authorization"];
  if (!token || !tokensDB.has(token)) return res.status(401).json({ error: "Login required" });
  req.user = tokensDB.get(token);
  next();
}

const BOTS = ["facebookexternalhit","facebookbot","facebot","googlebot","googlebot-image","adsbot-google","twitterbot","linkedinbot","whatsapp","telegrambot","discordbot","slackbot","pinterest","redditbot","snapchat","instagram","bingbot","yahooslurp","duckduckbot","baiduspider","yandexbot","scraper","crawler","spider","curl","wget","headless","selenium","puppeteer","playwright","python-requests","node-fetch","axios"];

function detectBot(req) {
  const ua = (req.headers["user-agent"] || "").toLowerCase();
  for (let b of BOTS) { if (ua.includes(b)) return true; }
  return false;
}

function getDevice(ua) {
  if (ua.includes("Mobile")||ua.includes("Android")) return "Mobile";
  if (ua.includes("Tablet")||ua.includes("iPad")) return "Tablet";
  return "Desktop";
}

// AUTH
app.post("/api/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || username.length < 3 || password.length < 4) return res.json({ error: "Min 3/4 chars" });
  if (await usersCol.findOne({ username })) return res.json({ error: "Username exists" });
  await usersCol.insertOne({ username, password, createdAt: new Date() });
  const token = generateToken(); tokensDB.set(token, username);
  res.json({ success: true, token, username });
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await usersCol.findOne({ username, password });
  if (!user) return res.json({ error: "Invalid credentials" });
  const token = generateToken(); tokensDB.set(token, username);
  res.json({ success: true, token, username });
});

// CREATE
app.post("/api/create", auth, async (req, res) => {
  const { offerPage, alias } = req.body;
  if (!offerPage?.startsWith("http")) return res.json({ error: "Valid URL required" });
  const code = alias || shortid.generate();
  if (await linksCol.findOne({ code })) return res.json({ error: "Alias taken" });
  await linksCol.insertOne({ code, offerPage, owner: req.user, active: true, created: new Date() });
  await analyticsCol.insertOne({ code, total:0, humans:0, bots:0, devices:{}, browsers:{}, os:{}, logs:[] });
  res.json({ success: true, shortUrl: `https://${req.get("host")}/${code}`, code });
});

// REDIRECT
app.get("/:code", async (req, res) => {
  const data = await linksCol.findOne({ code: req.params.code });
  if (!data?.active) return res.send("<h1>Not found</h1>");
  
  const ua = req.headers["user-agent"] || "";
  const isBot = detectBot(req);
  
  await analyticsCol.updateOne({ code: req.params.code }, { $inc: { total: 1, [isBot?"bots":"humans"]: 1 } });
  
  if (isBot) {
    await analyticsCol.updateOne({ code: req.params.code }, {
      $push: { logs: { $each: [{ type:"bot", time: new Date() }], $slice: -100 } }
    });
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta property="og:title" content="Safe Link"><meta property="og:description" content="Verified safe link"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Safe Link</title><style>body{font-family:Arial;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f5f5f5;margin:0}.page{background:white;padding:40px;border-radius:20px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,0.1);max-width:500px;margin:20px}.icon{font-size:60px}h1{color:#333}p{color:#666;margin:15px 0}.link{display:inline-block;background:#4CAF50;color:white;padding:14px 35px;text-decoration:none;border-radius:30px;font-weight:bold;font-size:16px}</style></head><body><div class="page"><div class="icon">✅</div><h1>Safe Content Page</h1><p>This link is verified and safe.</p><a href="${data.offerPage}" class="link">Access Content →</a></div></body></html>`);
  } else {
    const device = getDevice(ua);
    await analyticsCol.updateOne({ code: req.params.code }, {
      $inc: { [`devices.${device}`]: 1 },
      $push: { logs: { $each: [{ type:"human", device, time: new Date() }], $slice: -100 } }
    });
    res.redirect(data.offerPage);
  }
});

// MY LINKS
app.get("/api/mylinks", auth, async (req, res) => {
  const links = await linksCol.find({ owner: req.user }).sort({ created: -1 }).toArray();
  const result = [];
  for (let l of links) {
    const s = await analyticsCol.findOne({ code: l.code });
    result.push({ code:l.code, offerPage:l.offerPage, totalClicks:s?.total||0, humanClicks:s?.humans||0, botClicks:s?.bots||0 });
  }
  res.json({ links: result });
});

// ANALYTICS
app.get("/api/analytics/:code", auth, async (req, res) => {
  const link = await linksCol.findOne({ code: req.params.code });
  if (!link || link.owner !== req.user) return res.json({ error: "Not found" });
  const stats = await analyticsCol.findOne({ code: req.params.code });
  const t = stats?.total || 0;
  res.json({
    link: { code: link.code, offerPage: link.offerPage },
    overview: { totalClicks:t, humanClicks:stats?.humans||0, botClicks:stats?.bots||0, humanRate:t>0?Math.round((stats.humans/t)*100):0, botRate:t>0?Math.round((stats.bots/t)*100):0 },
    devices: stats?.devices || {},
    recentLogs: (stats?.logs || []).slice(-20).reverse()
  });
});

// SELF-PING (Anti-Sleep)
const SELF_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT||3000}`;
setInterval(() => {
  require('http').get(SELF_URL, () => {});
}, 5 * 60 * 1000);
console.log("🔔 Self-ping active - Server kabhi sleep nahi hoga!");

app.listen(process.env.PORT || 3000, () => console.log("✅ Server Ready!"));
