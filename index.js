import express from "express";
import cors from "cors";
import fs from "fs-extra";

import Swap from "./Swap.js";
import Catalog from "./Catalog.js";
import Proxy from "./Proxy.js";

const app = express();
const PORT = 4355;
const LOG_FILE = "./logs.json";

/* =========================
   CORS & PARSING
========================= */
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://app.dpswallet.com",
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) {
      cb(null, true);
    } else {
      cb(new Error("CORS blocked by policy"));
    }
  },
}));

// Built-in body parser for JSON
app.use(express.json());

/* =========================
   SMART LOGGER & CONSOLE
========================= */
app.use(async (req, res, next) => {
  const currentPath = `${req.method} ${req.originalUrl}`;
  const currentTime = new Date().toISOString();

  // 1. Terminal Console for Debugging (JSON Data Visibility)
  console.log("\n-------------------------------------------");
  console.log(`[${currentTime}] REQUEST: ${currentPath}`);
  
  if (req.body && Object.keys(req.body).length > 0) {
    console.log("POSTED DATA:");
    console.dir(req.body, { depth: null, colors: true });
  }

  // 2. Optimized JSON Logging (Prevents Huge Files)
  try {
    await fs.ensureFile(LOG_FILE);
    const data = await fs.readFile(LOG_FILE, "utf8");
    let logs = [];

    if (data.trim()) {
      try {
        logs = JSON.parse(data);
      } catch (e) {
        logs = [];
      }
    }

    const existingIndex = logs.findIndex((l) => l.path === currentPath);

    if (existingIndex > -1) {
      // Update only the timestamp for the existing path
      logs[existingIndex].lastSeen = currentTime;
    } else {
      // Add new unique entry
      logs.push({
        path: currentPath,
        lastSeen: currentTime,
      });
    }

    await fs.writeFile(LOG_FILE, JSON.stringify(logs, null, 2));
  } catch (error) {
    console.error("Logger Error:", error.message);
  }

  next();
});

/* =========================
   ROUTE SELECTOR
========================= */

// Health Check
app.get("/", (req, res) => {
  res.json({ status: true, service: "Custom API Running" });
});

// Forwarding to Swap.js
// Data exchange happens here: Swap.js receives req.body and returns response
app.use("/swap", Swap);

// Forwarding to Catalog.js
app.use("/catalog", Catalog);

// Fallback to Proxy.js (Any path not defined above)
app.use("*", Proxy);

/* =========================
   GLOBAL ERROR HANDLER
========================= */
app.use((err, req, res, next) => {
  console.error("CRITICAL_ERROR:", err.stack);
  res.status(500).json({
    success: false,
    message: "Internal Server Error",
    details: err.message
  });
});

/* =========================
   START SERVER
========================= */
app.listen(PORT, () => {
  console.log(`🚀 API Server is active on http://localhost:${PORT}`);
});