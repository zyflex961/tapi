// index
import express from "express";
import Catalog from "./Catalog.js";
import Swap from "./Swap.js";
import Proxy from "./Proxy.js";
import initEuroBot, { getUserData, getTasks, claimTaskReward } from "./Telegram.js";

// bot start
initEuroBot();
const app = express();
const PORT = 4355;

/* ===============================
   ALLOWED ORIGINS
=============================== */
const allowedOrigins = [
  "http://localhost:4321",
  "http://127.0.0.1:4321",
  "https://dpsweb.vercel.app",
  "https://walletdpstg.netlify.app",
  "https://wallet-multisend.vercel.app",
  "https://walletweb-delta.vercel.app",
  "https://walletdps.vercel.app",
];

/* =============================
   CORS HEADERS FUNCTION (AS-IS)
=============================== */
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

/* ===============================
   GLOBAL CORS GATE (ENTRY POINT)
================================== */
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const headers = corsHeaders(origin);

  Object.entries(headers).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  // Preflight
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  // Block if origin not allowed
  if (origin && !allowedOrigins.includes(origin)) {
    return res.status(403).json({
      success: false,
      error: "Origin not allowed",
    });
  }

  next();
});

/* ===================================
   ROUTE MAPPING (GATEWAY LOGIC)
================================== */

// Health check
app.get("/", (req, res) => {
  res.end("Custom API Gateway Running");
});

// 🟢 Catalog → local backend
app.use("/v2/dapp/catalog", Catalog);

// refer/save 
//app.use("reffer/", Reffer)

// request from mini app
app.get('/api/user/:chatId', getUserData);
app.get('/api/tasks', getTasks);
app.post('/api/tasks/claim', claimTaskReward);






// Swap → Omniston (inside Swap.js)
app.use("/swap/ton", Swap);

// Anything else → Proxy (MyTonWallet style)
app.use(Proxy);

/* =====================================
   START SERVER
=================================== */
app.listen(PORT, () => {
  console.log(`📂 Catalog Access: https://tapi-27fd.onrender.com/v2/dapp/catalog`);
});




