import express from "express";
import { WebSocketServer } from "ws";
import { TonClient } from "@ton/ton";
import { toNano, fromNano } from "@ton/core";
import { Omniston } from "@ston-fi/omniston-sdk";

const router = express.Router();

/* -------- CONFIG -------- */
// یہاں ٹون سینٹر صرف SDK کو خاموش رکھنے کے لیے ہے، اصل کام اومنی سٹون کا RPC کرے گا
const TON_ENDPOINT = "https://toncenter.com/api/v2/jsonRPC";
const SERVICE_FEE_ADDRESS = "UQAJ3_21reITe-puJuEyRotn0PWlLDcbuTKF65JxhvjTBtuI";
const SERVICE_FEE_BPS = 50; 

/* -------- CLIENTS -------- */
const tonClient = new TonClient({ endpoint: TON_ENDPOINT });
const omniston = new Omniston({ 
  tonClient,
  apiUrl: "https://omniston-mainnet.ston.fi/rpc" // تمام قیمتیں اور Estimation یہاں سے آئیں گی
});

/* -------- HELPERS (Conversion Logic) -------- */
// فرنٹ اینڈ کا نمبر (1 USDT) -> یونٹس (1000000)
const toUnits = (amount) => toNano(amount.toString()).toString();

// اومنی سٹون کے یونٹس -> فرنٹ اینڈ کا نمبر (نمائش کے لیے)
const fromUnits = (amount) => {
  if (!amount) return "0";
  return fromNano(amount.toString());
};

/* -------- WEB SOCKET (Estimation & Quotes) -------- */
export const setupSwapWebSocket = (server) => {
  const wss = new WebSocketServer({ server, path: "/swap/ws" });

  wss.on("connection", (ws) => {
    let activeSubscription = null;

    ws.on("message", async (message) => {
      try {
        const payload = JSON.parse(message);
        const { offerAsset, askAsset, offerAmount, userAddress } = payload;

        if (activeSubscription) await activeSubscription.return();

        // ڈیٹا کو یونٹس میں بدل کر اسٹون فائی کو بھیجنا
        activeSubscription = await omniston.subscribe({
          offerAssetAddress: offerAsset,
          askAssetAddress: askAsset,
          offerAmount: toUnits(offerAmount), 
          address: userAddress,
          referralAddress: SERVICE_FEE_ADDRESS,
          referralFeeBps: SERVICE_FEE_BPS,
        });

        // اومنی سٹون سے آنے والا ریئل ٹائم ڈیٹا (Quotes)
        for await (const quote of activeSubscription) {
          if (ws.readyState !== ws.OPEN) break;

          // ڈیٹا کو واپس نمبر میں بدل کر فرنٹ اینڈ کو بھیجنا
          const response = {
            event: "quote_update",
            data: {
              outputAmount: fromUnits(quote.askAmount), // کتنا ٹون ملے گا (نمبر میں)
              blockchainFee: fromUnits(quote.blockchainFee),
              minAskAmount: fromUnits(quote.minAskAmount),
              priceImpact: quote.priceImpact, 
              referralFee: fromUnits(quote.referralFee || 0),
            },
          };

          ws.send(JSON.stringify(response));
        }

      } catch (err) {
        console.error("Omniston Error:", err.message);
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ error: "ESTIMATION_FAILED", details: err.message }));
        }
      }
    });

    ws.on("close", () => {
      if (activeSubscription) activeSubscription.return();
    });
  });
};

/* -------- BUILD TRANSACTION (Final Swap) -------- */
router.post("/swap/build", async (req, res) => {
  try {
    const { offerAsset, askAsset, offerAmount, minAskAmount, userAddress } = req.body;

    const tx = await omniston.buildSwapTransaction({
      offerAssetAddress: offerAsset,
      askAssetAddress: askAsset,
      offerAmount: toUnits(offerAmount),
      minAskAmount: toUnits(minAskAmount),
      address: userAddress,
      referralAddress: SERVICE_FEE_ADDRESS,
      referralFeeBps: SERVICE_FEE_BPS,
    });

    res.json({
      success: true,
      data: {
        to: tx.to.toString(),
        value: tx.value.toString(),
        payload: tx.payload.toBoc().toString("base64"),
      }
    });
  } catch (error) {
    res.status(500).json({ error: "BUILD_FAILED", details: error.message });
  }
});

export default router;
