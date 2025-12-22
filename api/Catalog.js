import express from "express";
import fs from "fs";
import path from "path";

const router = express.Router();

// ⚠️ Absolute path (safe & reliable)
const CATALOG_PATH = path.resolve(process.cwd(), "Catalog.json");

/* =====================================
   HEADERS (MINIMUM REQUIRED)
===================================== */
router.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept, Origin"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

/* =====================================
   GET CATALOG (NO CACHE, REAL-TIME)
===================================== */
router.get("/", (req, res) => {
  try {
    // ✅ ALWAYS fresh read
    const fileContent = fs.readFileSync(CATALOG_PATH, "utf8");

    // ✅ Parse fresh JSON
    const catalogData = JSON.parse(fileContent);

    // ✅ EXACT JSON (no injection)
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(catalogData));
  } catch (err) {
    res.status(500).json({
      error: "Failed to read Catalog.json",
      message: err.message,
    });
  }
});

export default router;
