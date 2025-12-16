import express from "express";
import fs from "fs";
import path from "path";

const router = express.Router();

// Catalog.json کا path
const CATALOG_PATH = path.resolve("./Catalog.json");

/* =========================
   HEADERS / HYDRATION
========================= */
router.use((req, res, next) => {
  // Frontend headers allow
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept, Origin"
  );

  // Preflight request handle
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

/* =========================
   GET CATALOG (REAL-TIME)
========================= */
router.get("/", (req, res) => {
  try {
    // ❗ No require(), no import → always fresh
    const rawData = fs.readFileSync(CATALOG_PATH, "utf-8");
    const data = JSON.parse(rawData);

    res.json({
      success: true,
      source: "Catalog.json",
      updatedAt: fs.statSync(CATALOG_PATH).mtime,
      data,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Failed to load catalog",
      message: err.message,
    });
  }
});

export default router;