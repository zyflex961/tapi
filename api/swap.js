/**
 * swap.js - Final unified aggregator (STON.fi Omniston + STON REST + DeDust)
 * - Listens on port 5356 (http://localhost:5356)
 * - Endpoints under /proxy/swap/ton/*
 * - Full request/response/error logging (console JSON)
 * - Human <-> atomic conversions based on token decimals
 * - Referral address set and referral fee = 1% by default
 *
 * Save as: swap.js
 * Run: node swap.js
 *
 * Env (optional overrides):
 *  PORT=5356
 *  OMNISTON_WS=wss://omni-ws.ston.fi
 *  STON_SIMULATE=https://api.ston.fi/v2/swap/simulate
 *  STON_TOKENS=https://api.ston.fi/v2/tokens/list
 *  DEDUST_API=https://api.dedust.io/v2
 *  AGGREGATOR_WALLET=... (default provided below)
 *  AGG_FEE=1
 *  EXECUTE_ENDPOINT_STON=
 *  EXECUTE_ENDPOINT_DEDUST=
 *  ALLOWED_ORIGINS="*"
 */

const http = require("http");
const express = require("express");
const cors = require("cors");

// fetch shim for Node <18
let fetchFn;
if (typeof fetch === "function") fetchFn = fetch;
else {
  try { fetchFn = require("node-fetch"); }
  catch (e) { fetchFn = (...args) => import("node-fetch").then(m => m.default(...args)); }
}

// dynamic import wrapper for Omniston SDK (ESM)
async function importOmnistonSDK() {
  try {
    return await import("@ston-fi/omniston-sdk");
  } catch (e) {
    console.error("Omniston SDK import failed:", e && e.message ? e.message : e);
    return null;
  }
}

/* ---------------- CONFIG ---------------- */
const PORT = Number(process.env.PORT || 5356);
const BASE_PATH = process.env.BASE_PATH || "/proxy/swap/ton";

const OMNISTON_WS = process.env.OMNISTON_WS || "wss://omni-ws.ston.fi";
const STON_SIMULATE = process.env.STON_SIMULATE || "https://api.ston.fi/v2/swap/simulate";
const STON_TOKENS = process.env.STON_TOKENS || "https://api.ston.fi/v2/tokens/list";
const STON_POOLS = process.env.STON_POOLS || "https://api.ston.fi/v2/pools/list";
const DEDUST_API = process.env.DEDUST_API || "https://api.dedust.io/v2";

// Default referral address (you asked to set the one I used earlier)
const AGGREGATOR_WALLET = process.env.AGGREGATOR_WALLET || "UQBLhEO_VE9uFGHbKucbqcOFeH8AqhIooPp8VhJe_qYvOAZM";

// Referral fee = 1.0% (you requested)
const AGG_FEE_PERCENT = Number(process.env.AGG_FEE || 1.0);

const EXECUTE_ENDPOINT_STON = process.env.EXECUTE_ENDPOINT_STON || "";
const EXECUTE_ENDPOINT_DEDUST = process.env.EXECUTE_ENDPOINT_DEDUST || "";
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",") : ["*"];

/* ---------------- Logging helpers ---------------- */
function now() { return new Date().toISOString(); }
function pretty(obj) {
  try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
}
function log(title, obj) {
  console.log("\n===== " + title + " @ " + now() + " =====");
  if (obj !== undefined) {
    console.log(pretty(obj));
  }
  console.log("==========================================\n");
}
function safeParse(text) { try { return JSON.parse(text); } catch { return null; } }

/* ---------------- Request Body Logger Middleware ---------------- */
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes("*")) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(null, false);
  }
}));

// Global request logger - prints headers, query, params, body
app.use((req, res, next) => {
  console.log("\n------ Incoming Request ------");
  console.log("Path:", req.path);
  console.log("Method:", req.method);
  console.log("Headers:", pretty(req.headers));
  console.log("Query:", pretty(req.query));
  console.log("Params:", pretty(req.params));
  console.log("Body:", pretty(req.body));
  console.log("------ End Request ------\n");
  next();
});

/* ---------------- Token normalization & unit conversion ---------------- */
function normalizeFrontToken(v) {
  if (!v) return null;
  if (typeof v !== "string") v = String(v);
  const t = v.trim();
  if (/^ton$/i.test(t) || /^native$/i.test(t)) return "ton";
  const base = t.split("__")[0];
  return base.replace(/[^A-Za-z0-9_\-]/g, "") || null;
}

function humanToAtomic(human, decimals = 9) {
  if (human === undefined || human === null || human === "") return null;
  const s = String(human).trim();
  const [intPart, fracPart = ""] = s.split(".");
  const frac = fracPart.slice(0, decimals).padEnd(decimals, "0");
  return (BigInt(intPart || "0") * (BigInt(10) ** BigInt(decimals)) + BigInt(frac || "0")).toString();
}

function atomicToHuman(atomicStr, decimals = 9) {
  if (atomicStr === undefined || atomicStr === null || atomicStr === "") return null;
  const a = BigInt(atomicStr);
  const denom = BigInt(10) ** BigInt(decimals);
  const intPart = a / denom;
  let frac = (a % denom).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac.length ? `${intPart.toString()}.${frac}` : intPart.toString();
}

/* ---------------- token decimals cache ---------------- */
const tokenDecimalsCache = new Map();
async function fetchTokenDecimals(tokenNormalized) {
  if (!tokenNormalized) return 9;
  if (tokenNormalized === "ton") return 9;
  if (tokenDecimalsCache.has(tokenNormalized)) return tokenDecimalsCache.get(tokenNormalized);
  try {
    log("Fetching STON tokens list for decimals", { url: STON_TOKENS });
    const resp = await fetchFn(STON_TOKENS);
    const txt = await resp.text();
    const parsed = safeParse(txt) || {};
    log("STON tokens sample", { status: resp.status, sample: parsed.asset_list?.slice?.(0,5) ?? parsed.tokens?.slice?.(0,5) ?? null });
    const list = parsed.asset_list || parsed.tokens || parsed || [];
    const found = list.find(t => (t.address && t.address === tokenNormalized) || (t.symbol && String(t.symbol).toLowerCase() === String(tokenNormalized).toLowerCase()));
    const decimals = found ? (Number(found.decimals) || 9) : 9;
    tokenDecimalsCache.set(tokenNormalized, decimals);
    return decimals;
  } catch (err) {
    log("Error fetching token decimals", String(err && err.message ? err.message : err));
    tokenDecimalsCache.set(tokenNormalized, 9);
    return 9;
  }
}

/* ---------------- Provider wrappers ---------------- */
async function callStonSimulate(offerAddr, askAddr, unitsAtomic, slippageDecimal = "0.01", referral = null) {
  try {
    const body = {
      offer_address: offerAddr === "ton" ? "ton" : offerAddr,
      ask_address: askAddr === "ton" ? "ton" : askAddr,
      units: String(unitsAtomic),
      slippage_tolerance: String(slippageDecimal)
    };
    if (referral) body.referral = referral;
    log("OUTBOUND → STON.simulate", { url: STON_SIMULATE, body });
    const resp = await fetchFn(STON_SIMULATE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const text = await resp.text();
    const parsed = safeParse(text);
    log("INBOUND ← STON.simulate", { status: resp.status, parsedSample: parsed ?? null, textSnippet: text.slice(0,1200) });
    return { ok: resp.ok, status: resp.status, parsed, rawText: text };
  } catch (err) {
    log("STON.simulate error", String(err && err.message ? err.message : err));
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

async function callDedustEstimate(fromNorm, toNorm, amountAtomic) {
  try {
    const url = `${DEDUST_API}/swap/estimate`;
    const body = {
      from: fromNorm === "ton" ? { type: "native" } : { type: "jetton", address: fromNorm },
      to: toNorm === "ton" ? { type: "native" } : { type: "jetton", address: toNorm },
      amount: String(amountAtomic)
    };
    log("OUTBOUND → DeDust.estimate", { url, body });
    const resp = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const text = await resp.text();
    const parsed = safeParse(text);
    log("INBOUND ← DeDust.estimate", { status: resp.status, parsedSample: parsed ?? null, textSnippet: text.slice(0,1200) });
    return { ok: resp.ok, status: resp.status, parsed, rawText: text };
  } catch (err) {
    log("DeDust.estimate error", String(err && err.message ? err.message : err));
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

/* ---------- Numeric extraction helpers ---------- */
function extractNumericFromSton(parsed) {
  if (!parsed) return null;
  const keys = ["ask_units", "min_ask_units", "askUnits", "minAskUnits", "amount_out", "amountOut", "outAmount"];
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(parsed, k)) {
      const v = parsed[k];
      if (typeof v === "string" && /^\d+$/.test(v)) return v;
      if (typeof v === "number" && Number.isFinite(v)) return String(Math.floor(v));
      if (typeof v === "object" && v !== null) {
        const nested = Object.values(v).find(x => typeof x === "string" && /^\d+$/.test(x));
        if (nested) return nested;
      }
    }
  }
  if (parsed.result) return extractNumericFromSton(parsed.result);
  if (parsed.data) return extractNumericFromSton(parsed.data);
  return null;
}
function extractNumericFromDedust(parsed) {
  if (!parsed) return null;
  const keys = ["amountOut", "amount_out", "out", "outputAmount"];
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(parsed, k)) {
      const v = parsed[k];
      if (typeof v === "string" && /^\d+$/.test(v)) return v;
      if (typeof v === "number" && Number.isFinite(v)) return String(Math.floor(v));
      if (typeof v === "object" && v !== null) {
        const nested = Object.values(v).find(x => typeof x === "string" && /^\d+$/.test(x));
        if (nested) return nested;
      }
    }
  }
  if (Array.isArray(parsed) && parsed.length) return extractNumericFromDedust(parsed[0]);
  if (parsed.result) return extractNumericFromDedust(parsed.result);
  return null;
}
function extractAtomicFromOmnistonQuote(quote) {
  if (!quote) return null;
  if (quote.askUnits && /^\d+$/.test(String(quote.askUnits))) return String(quote.askUnits);
  if (quote.bidUnits && /^\d+$/.test(String(quote.bidUnits))) return String(quote.bidUnits);
  if (quote.ask_units && /^\d+$/.test(String(quote.ask_units))) return String(quote.ask_units);
  return null;
}

/* ---------------- Omniston SDK client (dynamic) ---------------- */
let omnistonClient = null;
let OmnistonSDK = null;
async function initOmniston() {
  if (omnistonClient && OmnistonSDK) return { omnistonClient, OmnistonSDK };
  try {
    const sdk = await importOmnistonSDK();
    if (!sdk) return { omnistonClient: null, OmnistonSDK: null };
    OmnistonSDK = sdk;
    omnistonClient = new sdk.Omniston({ apiUrl: OMNISTON_WS });
    log("Omniston client created", { OMNISTON_WS });
    return { omnistonClient, OmnistonSDK };
  } catch (err) {
    log("initOmniston error", String(err && err.message ? err.message : err));
    omnistonClient = null; OmnistonSDK = null;
    return { omnistonClient: null, OmnistonSDK: null };
  }
}

/* ---------------- Core aggregator flow ---------------- */
async function getBestQuote({ fromRaw, toRaw, humanAmount, slippagePercent = 1, referral = AGGREGATOR_WALLET }) {
  log("AGG received frontend payload", { fromRaw, toRaw, humanAmount, slippagePercent, referral });

  const offer = normalizeFrontToken(fromRaw);
  const ask = normalizeFrontToken(toRaw);
  if (!offer || !ask) {
    log("Invalid tokens after normalization", { fromRaw, toRaw, offer, ask });
    return { ok: false, error: "invalid_tokens", details: { fromRaw, toRaw } };
  }

  const offerDecimals = await fetchTokenDecimals(offer);
  const askDecimals = await fetchTokenDecimals(ask);

  const unitsAtomic = humanToAtomic(humanAmount, offerDecimals);
  log("Converted human -> atomic", { humanAmount, offerDecimals, unitsAtomic });

  const stonOffer = offer === "ton" ? "ton" : offer;
  const stonAsk = ask === "ton" ? "ton" : ask;
  const slippageDecimal = String(Number(slippagePercent) / 100);

  // 1) Omniston RFQ preferred
  let omnistonQuote = null;
  try {
    const { omnistonClient, OmnistonSDK } = await initOmniston();
    if (omnistonClient && OmnistonSDK) {
      const rfqReq = {
        settlementMethods: [OmnistonSDK.SettlementMethod.SETTLEMENT_METHOD_SWAP],
        askAssetAddress: { blockchain: OmnistonSDK.Blockchain.TON, address: stonAsk === "ton" ? undefined : stonAsk },
        bidAssetAddress: { blockchain: OmnistonSDK.Blockchain.TON, address: stonOffer === "ton" ? undefined : stonOffer },
        amount: { bidUnits: String(unitsAtomic) },
        settlementParams: {
          maxPriceSlippageBps: Math.round(Number(slippagePercent) * 100),
          gaslessSettlement: OmnistonSDK.GaslessSettlement.GASLESS_SETTLEMENT_POSSIBLE,
          maxOutgoingMessages: 4,
          flexibleReferrerFee: true
        }
      };
      if (referral) rfqReq.referrerAddress = { blockchain: OmnistonSDK.Blockchain.TON, address: referral };
      log("OUTBOUND → Omniston.requestForQuote (subscribe)", rfqReq);

      const observable = omnistonClient.requestForQuote(rfqReq);
      omnistonQuote = await new Promise((resolve) => {
        const sub = observable.subscribe((ev) => {
          log("INBOUND ← Omniston RFQ event", ev);
          if (ev.type === "quoteUpdated" && ev.quote) {
            sub.unsubscribe();
            resolve({ ok: true, quote: ev.quote, rfqId: ev.rfqId });
          } else if (ev.type === "noQuote") {
            sub.unsubscribe(); resolve({ ok: false, error: "noQuote" });
          }
        });
        setTimeout(() => { try { sub.unsubscribe(); } catch {} ; resolve({ ok: false, error: "timeout" }); }, 6000);
      });
      if (!omnistonQuote.ok) log("Omniston RFQ result", omnistonQuote);
    } else {
      log("Omniston client not available - skipping RFQ");
    }
  } catch (err) {
    log("Omniston RFQ error", String(err && err.message ? err.message : err));
  }

  // 2) STON simulate & 3) DeDust estimate in parallel
  const stonPromise = callStonSimulate(stonOffer, stonAsk, unitsAtomic, slippageDecimal, referral);
  const dedustPromise = callDedustEstimate(offer, ask, unitsAtomic);
  const [stonResp, dedustResp] = await Promise.all([stonPromise, dedustPromise]);

  // extract atomic results
  const omnAtomic = omnistonQuote && omnistonQuote.ok ? extractAtomicFromOmnistonQuote(omnistonQuote.quote) : null;
  const stonAtomic = stonResp.ok ? extractNumericFromSton(stonResp.parsed ?? safeParse(stonResp.rawText)) : null;
  const dedustAtomic = dedustResp.ok ? extractNumericFromDedust(dedustResp.parsed ?? safeParse(dedustResp.rawText)) : null;

  log("Parsed atomic outputs", { omnAtomic, stonAtomic, dedustAtomic });

  const candidates = [];
  if (omnAtomic) candidates.push({ name: "OMNISTON", atomic: BigInt(omnAtomic), raw: omnistonQuote });
  if (stonAtomic) candidates.push({ name: "STON_REST", atomic: BigInt(stonAtomic), raw: stonResp });
  if (dedustAtomic) candidates.push({ name: "DEDUST", atomic: BigInt(dedustAtomic), raw: dedustResp });

  if (candidates.length === 0) {
    log("No provider returned numeric quote", { omnistonQuote, stonResp, dedustResp });
    return { ok: false, error: "no_provider_output", upstreams: { omniston: omnistonQuote, ston: stonResp, dedust: dedustResp } };
  }

  candidates.sort((a,b) => (a.atomic > b.atomic ? -1 : 1));
  const chosen = candidates[0];
  const chosenAtomicStr = chosen.atomic.toString();
  const chosenName = chosen.name;
  const askDecimals = ask === "ton" ? 9 : await fetchTokenDecimals(ask);
  const amountOutHuman = atomicToHuman(chosenAtomicStr, askDecimals);

  // aggregator fee
  const feeAtomic = (chosen.atomic * BigInt(Math.round(AGG_FEE_PERCENT * 1000))) / BigInt(100 * 1000);
  const userReceiveAtomic = chosen.atomic - feeAtomic;

  const result = {
    ok: true,
    dexUsed: chosenName,
    from: { token: offer, decimals: offerDecimals, amountHuman: String(humanAmount), amountAtomic: unitsAtomic },
    to: { token: ask, decimals: askDecimals, amountAtomic: chosenAtomicStr, amountHuman: amountOutHuman },
    aggregatorFeePercent: AGG_FEE_PERCENT,
    aggregatorFeeAmountHuman: atomicToHuman(feeAtomic.toString(), askDecimals),
    userReceiveAfterFeeHuman: atomicToHuman(userReceiveAtomic.toString(), askDecimals),
    providerRaw: chosen.raw,
    rawProviders: { omniston: omnistonQuote ?? null, ston: stonResp, dedust: dedustResp },
    debug: { slippagePercent, referral }
  };

  log("Best quote result prepared", result);
  return result;
}

/* ---------------- Build endpoint ---------------- */
async function handleBuild(body) {
  log("INBOUND FRONTEND /handleBuild body", body);
  const fromRaw = body.fromToken ?? body.from ?? body.offer;
  const toRaw = body.toToken ?? body.to ?? body.ask;
  const humanAmount = body.fromAmount ?? body.amount ?? body.units;
  const senderAddress = body.senderAddress ?? body.sourceAddress ?? null;
  const slippage = body.slippage ?? 1;
  const referral = body.referral ?? AGGREGATOR_WALLET;

  if (!fromRaw || !toRaw || humanAmount === undefined || !senderAddress) {
    log("Invalid build request - missing fields", { fromRaw, toRaw, humanAmount, senderAddress });
    return { ok: false, error: "invalid_input", details: { fromRaw, toRaw, humanAmount, senderAddress } };
  }

  const estimate = await getBestQuote({ fromRaw, toRaw, humanAmount, slippagePercent: slippage, referral });
  if (!estimate.ok) {
    log("Build aborted - estimate failed", estimate);
    return estimate;
  }

  // if Omniston chosen and quote present -> try buildTransfer
  try {
    const { omnistonClient, OmnistonSDK } = await initOmniston();
    if (omnistonClient && OmnistonSDK && estimate.dexUsed === "OMNISTON" && estimate.providerRaw && estimate.providerRaw.quote) {
      log("Attempting Omniston.buildTransfer", { quoteId: estimate.providerRaw.quote.quoteId });
      const tx = await omnistonClient.buildTransfer({
        quote: estimate.providerRaw.quote,
        sourceAddress: { blockchain: OmnistonSDK.Blockchain.TON, address: senderAddress },
        destinationAddress: { blockchain: OmnistonSDK.Blockchain.TON, address: senderAddress },
        gasExcessAddress: { blockchain: OmnistonSDK.Blockchain.TON, address: senderAddress },
        useRecommendedSlippage: true
      });
      log("Omniston.buildTransfer result", { messagesCount: tx?.ton?.messages?.length ?? 0 });
      return { ok: true, estimate, build: { provider: "OMNISTON", tx } };
    }
  } catch (err) {
    log("Omniston.buildTransfer error", String(err && err.message ? err.message : err));
  }

  // fallback -> template
  const offer = normalizeFrontToken(fromRaw);
  const ask = normalizeFrontToken(toRaw);
  const offerDecimals = await fetchTokenDecimals(offer);
  const askDecimals = await fetchTokenDecimals(ask);
  const isFromNative = (offer === "ton");
  const isToNative = (ask === "ton");

  const outAtomic = estimate.to.amountAtomic;
  const slippageFactorNum = BigInt(Math.floor((1 - (Number(slippage) / 100)) * 1000000));
  const minOutAtomic = (BigInt(outAtomic) * slippageFactorNum) / BigInt(1000000);

  let template = null;
  if (isFromNative && !isToNative) {
    template = {
      type: "TON->JETTON",
      to: "DEPOSIT_VAULT_OR_ROUTER_PLACEHOLDER",
      valueNano: humanToAtomic(humanAmount, 9),
      minOutAtomic: minOutAtomic.toString(),
      recipient: senderAddress,
      referral
    };
  } else if (!isFromNative && isToNative) {
    template = {
      type: "JETTON->TON",
      jettonMaster: offer,
      transferAmountAtomic: humanToAtomic(humanAmount, offerDecimals),
      forwardPayload: { op: "swap", minOutAtomic: minOutAtomic.toString(), recipient: senderAddress, referral }
    };
  } else if (!isFromNative && !isToNative) {
    template = {
      type: "JETTON->JETTON",
      fromJettonMaster: offer,
      toJettonPoolAddress: ask,
      transferAmountAtomic: humanToAtomic(humanAmount, offerDecimals),
      minOutAtomic: minOutAtomic.toString(),
   