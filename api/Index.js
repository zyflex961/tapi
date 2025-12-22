import express from "express";
import { Telegraf } from "telegraf"; // ٹیلی گرام لائبریری
import 'dotenv/config'; // انوائرمنٹ ویری ایبلز کے لیے

import Catalog from "./Catalog.js";
import Swap from "./Swap.js";
import Proxy from "./Proxy.js";
import initEuroBot from "./Telegram.js"; // آپ کی ٹیلی گرام بوٹ فائل

const app = express();
const PORT = 4355;

/* =====================================================
   TELEGRAM BOT INITIALIZATION
===================================================== */
// بوٹ ٹوکن .env فائل سے لیا جائے گا
const bot = new Telegraf(process.env.BOT_TOKEN);

// بوٹ کی تمام لاجک کو انیشلائز کریں
initEuroBot(bot);

// بوٹ کو لانچ کریں
bot.launch().then(() => {
    console.log("🤖 DPS Telegram Bot: Connected & Running");
}).catch((err) => {
    console.error("❌ Telegram Bot Error:", err);
});

/* =====================================================
   ALLOWED ORIGINS
===================================================== */
const allowedOrigins = [
  "http://localhost:4321",
  "http://127.0.0.1:4321",
  "http://localhost:4323",
  "http://localhost:4355",
  "http://127.0.0.1:4355",
  "http://localhost:8888",
  "http://127.0.0.1:8888",
  "https://walletdpstg.netlify.app",
  "https://wallet-multisend.vercel.app",
  "https://walletweb-delta.vercel.app",
  "https://walletdps.vercel.app",
];

/* =====================================================
   CORS HEADERS FUNCTION
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

/* =====================================================
   GLOBAL CORS GATE
===================================================== */
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
    return res.status(403).json({
      success: false,
      error: "Origin not allowed",
    });
  }

  next();
});

/* =====================================================
   ROUTE MAPPING
===================================================== */

app.get("/", (req, res) => {
  res.end("Custom API Gateway & Telegram Bot Running");
});

app.use("/v2/dapp/catalog", Catalog);
app.use("/swap/ton", Swap);
app.use(Proxy);

/* =====================================================
   START SERVER
===================================================== */
app.listen(PORT, () => {
  console.log(`🚀 API Gateway running on: http://localhost:${PORT}`);
  console.log(`📂 Catalog: http://localhost:${PORT}/v2/dapp/catalog`);
});

// پروسیس کو محفوظ طریقے سے بند کرنے کے لیے
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

