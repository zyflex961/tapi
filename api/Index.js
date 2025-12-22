import express from "express";
import { Telegraf } from "telegraf"; 
import 'dotenv/config'; 

import Catalog from "./Catalog.js";
import Swap from "./Swap.js";
import Proxy from "./Proxy.js";
import initEuroBot from "./Telegram.js"; // فائل کا نام اور کیس (Case) چیک کر لیں

const app = express();

/* =====================================================
   PORT SETTING (رینڈر کے لیے انتہائی ضروری)
===================================================== */
// رینڈر اپنی مرضی کی پورٹ process.env.PORT میں دیتا ہے
const PORT = process.env.PORT || 4355; 

/* =====================================================
   TELEGRAM BOT INITIALIZATION
===================================================== */
const bot = new Telegraf(process.env.BOT_TOKEN);

// بوٹ لاجک شروع کریں
initEuroBot(bot);

bot.launch().then(() => {
    console.log("🤖 DPS Telegram Bot: Live & Connected");
}).catch((err) => {
    console.error("❌ Telegram Bot Error:", err);
});

/* =====================================================
   ALLOWED ORIGINS
===================================================== */
const allowedOrigins = [
  "http://localhost:4321",
  "http://127.0.0.1:4321",
  "https://walletdpstg.netlify.app",
  "https://wallet-multisend.vercel.app",
  "https://walletweb-delta.vercel.app",
  "https://walletdps.vercel.app",
];

/* =====================================================
   CORS HEADERS & GATEWAY LOGIC (AS-IS)
===================================================== */
function corsHeaders(origin) {
  if (allowedOrigins.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "x-app-env, X-App-Env, X-App-Version, X-Requested-With, Content-Type, Authorization, Origin, Accept, X-App-Clientid, x-auth-token, X-Auth-Token, Referer, User-Agent, Cache-Control, Pragma",
      "Access-Control-Max-Age": "86400",
    };
  }
  return { "Access-Control-Allow-Origin": "null" };
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const headers = corsHeaders(origin);

  Object.entries(headers).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  if (origin && !allowedOrigins.includes(origin)) {
    return res.status(403).json({ success: false, error: "Origin not allowed" });
  }

  next();
});

/* =====================================================
   ROUTE MAPPING
===================================================== */

app.get("/", (req, res) => {
  res.send("<h1>DPS API Gateway & Telegram Bot is Running!</h1>");
});

app.use("/v2/dapp/catalog", Catalog);
app.use("/swap/ton", Swap);
app.use(Proxy);

/* =====================================================
   START SERVER
===================================================== */
// رینڈر کے لیے "0.0.0.0" پر بائنڈ کرنا اور متحرک پورٹ استعمال کرنا لازمی ہے
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server is running on port: ${PORT}`);
  console.log(`📂 Catalog Access: https://tapi-27fd.onrender.com/v2/dapp/catalog`);
});

// بوٹ کو محفوظ طریقے سے بند کرنے کے لیے
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
