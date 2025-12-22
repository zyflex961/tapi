import http from "http";
import https from "https";
import { URL } from "url";
import url from "url";
import fetch from "node-fetch"; 

import fs from "fs";
import path from "path";

// اگر catalog proxy میں بھی serve کرنا ہو
const CATALOG_PATH = path.resolve(process.cwd(), "Catalog.json");

function getCorsHeaders(req) {
  const origin = req.headers.origin || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "x-app-env, X-App-Env, X-App-Version, X-Requested-With, Content-Type, Authorization, Origin, Accept, X-App-Clientid, x-auth-token, X-Auth-Token, Referer, User-Agent, Cache-Control, Pragma",
  };
}

/*
|--------------------------------------------------------------------------
| PROXY MIDDLEWARE (NO SERVER, NO LISTEN)
|--------------------------------------------------------------------------
*/
export default async function Proxy(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const pathForCheck = parsedUrl.pathname
    ? parsedUrl.pathname.toLowerCase().replace(/\/+$/, "")
    : "";

  const corsHeaders = getCorsHeaders(req);

  // OPTIONS
  if (req.method === "OPTIONS") {
    res.writeHead(200, corsHeaders);
    return res.end("");
  }

  /* ------------------ LOCAL CATALOG (PROXY MODE) ------------------ */
  if (
    pathForCheck === "/v2/dapp/catalog" ||
    pathForCheck === "/proxy/v2/dapp/catalog"
  ) {
    try {
      const raw = fs.readFileSync(CATALOG_PATH, "utf8");
      res.writeHead(200, { ...corsHeaders, "Content-Type": "application/json" });
      return res.end(raw); // ❗ pure JSON, no injection
    } catch (e) {
      res.writeHead(500, corsHeaders);
      return res.end(JSON.stringify({ error: "Catalog read failed" }));
    }
  }

  /* ------------------ TARGET RESOLUTION ------------------ */
  let cleanPath = parsedUrl.pathname
    .replace(/^\/proxy/, "")
    .replace(/\/{2,}/g, "/");

  const targetUrl =
    cleanPath.startsWith("/swap/ton") || cleanPath.startsWith("/ton/build")
      ? `http://localhost:4356${cleanPath}${parsedUrl.search || ""}`
      : `https://api.mytonwallet.org${cleanPath}${parsedUrl.search || ""}`;

  /* ------------------ BODY COLLECT ------------------ */
  const chunks = [];
  req.on("data", (c) => chunks.push(c));

  req.on("end", async () => {
    try {
      const body = Buffer.concat(chunks);

      const proxyHeaders = { ...req.headers };
      delete proxyHeaders.host;

      proxyHeaders["Origin"] = "https://web.mytonwallet.org";
      proxyHeaders["Referer"] = "https://web.mytonwallet.org/";

      const response = await fetch(targetUrl, {
        method: req.method,
        headers: proxyHeaders,
        body: ["GET", "HEAD"].includes(req.method) ? undefined : body,
      });

      const buffer = Buffer.from(await response.arrayBuffer());

      const responseHeaders = { ...corsHeaders };
      response.headers.forEach((v, k) => {
        if (
          ![
            "content-encoding",
            "content-length",
            "access-control-allow-origin",
          ].includes(k)
        ) {
          responseHeaders[k] = v;
        }
      });

      res.writeHead(response.status, responseHeaders);
      res.end(buffer);
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(502, corsHeaders);
        res.end(JSON.stringify({ error: "Proxy Error" }));
      }
    }
  });
}
