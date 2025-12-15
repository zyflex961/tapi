import express from "express";
import bodyParser from "body-parser";
import { TonClient, toNano, fromNano } from "@ton/ton";
import { DEX, pTON } from "@ston-fi/sdk";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

// ==========================
// 🔧 CONFIG (CHANGE LATER)
// ==========================
const REFERRAL_WALLET_ADDRESS = "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"; 
// 👆 یہاں بعد میں اپنا referral wallet لگا دیں

const REFERRAL_FEE_PERCENT = 1; 
// 👆 1 = 1% referral fee

// ==========================
// TON CLIENT & ROUTER
// ==========================
const tonClient = new TonClient({
  endpoint: "https://toncenter.com/api/v2/jsonRPC",
});

const dexRouter = tonClient.open(new DEX.v1.Router());

// ==========================
// HELPERS
// ==========================
function numberToNano(value) {
  return toNano(value.toString());
}

function nanoToNumber(value) {
  return Number(fromNano(value));
}

// =====================================================
// 1️⃣ SWAP ESTIMATE (WITH REFERRAL)
// POST /swap/ton/estimate
// =====================================================
app.post("/swap/ton/estimate", async (req, res) => {
  try {
    const {
      offerTon,            // number
      askJettonAddress,
      slippage             // number (optional)
    } = req.body;

    if (!offerTon || !askJettonAddress) {
      return res.status(400).json({ error: "Invalid parameters" });
    }

    const response = await fetch(
      "https://api.ston.fi/v1/swap/simulate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offer_address: "TON",
          ask_address: askJettonAddress,
          offer_amount: numberToNano(offerTon).toString(),
          slippage: slippage ?? 0.005,
          referral_address: REFERRAL_WALLET_ADDRESS,
          referral_fee: REFERRAL_FEE_PERCENT,
        }),
      }
    );

    const data = await response.json();

    return res.json({
      expectedOut: nanoToNumber(data.ask_amount),
      minAskAmount: nanoToNumber(data.min_ask_amount),
      priceImpact: Number(data.price_impact),
      fee: nanoToNumber(data.fee_amount),
      referralFee: REFERRAL_FEE_PERCENT,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Estimate failed" });
  }
});

// =====================================================
// 2️⃣ BUILD SWAP TRANSACTION (WITH REFERRAL)
// POST /swap/ton/build
// =====================================================
app.post("/swap/ton/build", async (req, res) => {
  try {
    const {
      userAddress,
      offerTon,
      minAskAmount,
      askJettonAddress
    } = req.body;

    if (!userAddress || !offerTon || !minAskAmount || !askJettonAddress) {
      return res.status(400).json({ error: "Invalid parameters" });
    }

    const txParams = await dexRouter.getSwapTonToJettonTxParams({
      offerAmount: numberToNano(offerTon),
      askJettonAddress,
      minAskAmount: numberToNano(minAskAmount),
      proxyTon: new pTON.v1(),
      userWalletAddress: userAddress,
      referralAddress: REFERRAL_WALLET_ADDRESS, // ✅ referral here
    });

    return res.json({
      to: txParams.to.toString(),
      value: nanoToNumber(txParams.value),
      payload: txParams.body
        ? txParams.body.toBoc().toString("base64")
        : null,
      referralFeePercent: REFERRAL_FEE_PERCENT,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Build transaction failed" });
  }
});

// ==========================
// SERVER START
// ==========================
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Swap backend running on port ${PORT}`);
});