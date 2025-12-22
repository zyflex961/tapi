import express from "express";
import { WebSocketServer } from "ws"; // ویب ساکٹ سرور کے لیے
import { TonClient } from "@ton/ton";
import { toNano, fromNano } from "@ton/core";
import { Omniston } from "@ston-fi/omniston-sdk";

const router = express.Router();

/* -------- CONFIG -------- */
const TON_ENDPOINT = "https://toncenter.com/api/v2/jsonRPC";
const SERVICE_FEE_ADDRESS = "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const SERVICE_FEE_BPS = 50;

/* -------- CLIENTS -------- */
const tonClient = new TonClient({ endpoint: TON_ENDPOINT });
const omniston = new Omniston({ tonClient });

/* -------- HELPERS -------- */
const toUnits = (amount) => toNano(amount.toString()).toString();
const fromUnits = (amount) => fromNano(amount.toString());

/* -------- WEB SOCKET SERVER LOGIC -------- */
export const setupSwapWebSocket = (server) => {
  const wss = new WebSocketServer({ server, path: "/swap/ws" });

  console.log("🚀 Omniston WebSocket Server is ready at /swap/ws");

  wss.on("connection", (ws) => {
    console.log("📱 Client connected to Swap WS");
    let activeSubscription = null;

  
    ws.on("message", async (message) => {
      try {
        const payload = JSON.parse(message);
        const { offerAsset, askAsset, offerAmount, userAddress } = payload;

        if (activeSubscription) {
          activeSubscription = null; 
        }

        if (!offerAsset || !askAsset || !offerAmount) {
          ws.send(JSON.stringify({ error: "Missing required swap parameters" }));
          return;
        }

        const amountInUnits = toUnits(offerAmount);

        activeSubscription = await omniston.subscribe({
          offerAsset,
          askAsset,
          offerAmount: amountInUnits,
          userAddress,
          referralAddress: SERVICE_FEE_ADDRESS,
          referralFeeBps: SERVICE_FEE_BPS,
        });

        for await (const quote of activeSubscription) {
          if (ws.readyState !== ws.OPEN) break;

          const response = {
            event: "quote_update",
            data: {
              outputAmount: fromUnits(quote.askAmount),
              blockchainFee: fromUnits(quote.blockchainFee),
              minAskAmount: fromUnits(quote.minAskAmount),
              referralFee: fromUnits(quote.referralFee || 0),
              priceImpact: quote.priceImpact, 
            },
          };

          ws.send(JSON.stringify(response));
        }

      } catch (err) {
        console.error("WS Message Error:", err.message);
        ws.send(JSON.stringify({ error: "SUBSCRIPTION_FAILED", details: err.message }));
      }
    });

    ws.on("close", () => {
      console.log("❌ Client disconnected");
      activeSubscription = null;
    });
  });
};

/* -------- STANDARD HTTP ROUTES (Build & Health) -------- */
router.post("/swap/build", async (req, res) => {
  try {
    const { offerAsset, askAsset, offerAmount, minAskAmount, userAddress } = req.body;
    
    const tx = await omniston.buildSwapTransaction({
      offerAsset,
      askAsset,
      offerAmount: toUnits(offerAmount),
      minAskAmount: toUnits(minAskAmount),
      userAddress,
      referralAddress: SERVICE_FEE_ADDRESS,
      referralFeeBps: SERVICE_FEE_BPS,
    });

    res.json({
      success: true,
      data: {
        to: tx.to.toString(),
        value: fromUnits(tx.value),
        payload: tx.payload.toBoc().toString("base64"),
      }
    });
  } catch (error) {
    res.status(500).json({ error: "BUILD_FAILED", details: error.message });
  }
});

router.get("/swap/health", (req, res) => res.json({ status: "OK" }));

export default router;
