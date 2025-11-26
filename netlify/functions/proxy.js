// netlify/functions/proxy.js

import fs from "fs";
import path from "path";
import url from "url";

// --- FIX: Safe dirname for Netlify ---
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// --- Load catalog.json ---
let catalog = {};
const catalogFile = path.join(__dirname, "catalog.json");

try {
  const data = fs.readFileSync(catalogFile, "utf8");
  catalog = JSON.parse(data);
  console.log("📦 catalog.json loaded.");
} catch (err) {
  console.error("❌ catalog load error:", err.message);
  catalog = { error: "Catalog missing or invalid JSON" };
}

// --- Allowed Origins ---
const allowedOrigins = [
  "https://tonapi.netlify.app",
  "http://localhost:4321",
  "http://127.0.0.1:4321",
  "*",
];

// --- CORS Handler ---
function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
      ? origin
      : "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "*",
  };
}

// --- Main Handler ---
export async function handler(event) {
  const origin = event.headers.origin || "*";
  const headers = corsHeaders(origin);

  // --- Preflight ---
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  // --- Parse URL ---
  const parsed = url.parse(event.rawUrl, true);
  const pathname = parsed.pathname;
  const search = parsed.search || "";

  // --- catalog.json Serve ---
  const clean = pathname
    .replace("/.netlify/functions/proxy", "")
    .replace("/proxy", "")
    .replace(/\/+$/, "");

  if (clean === "/v2/dapp/catalog") {
    return {
      statusCode: 200,
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(catalog, null, 2),
    };
  }

  if (clean === "/robots.txt") {
    return { statusCode: 200, headers, body: "" };
  }

  // --- Forward to MyTonWallet API ---
  const proxyPath = pathname
    .replace("/.netlify/functions/proxy", "")
    .replace("/proxy", "");

  const targetUrl = `https://api.mytonwallet.org${proxyPath}${search}`;

  console.log("➡️ Forwarding:", targetUrl);

  try {
    const result = await fetch(targetUrl, {
      method: event.httpMethod,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-App-Env": "Production",
      },
      body:
        event.httpMethod === "GET" || event.httpMethod === "HEAD"
          ? undefined
          : event.body,
    });

    const text = await result.text();

    return {
      statusCode: result.status,
      headers: {
        ...headers,
        "Content-Type":
          result.headers.get("content-type") || "application/json",
      },
      body: text,
    };
  } catch (err) {
    console.error("❌ Proxy error:", err.message);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
}