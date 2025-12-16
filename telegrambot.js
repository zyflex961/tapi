import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";

const USERS_FILE = path.resolve("./telegram-users.json");

export default function startTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const webAppUrl = process.env.WEB_APP_URL;

  if (!token) {
    console.log("⚠️ Telegram bot token missing");
    return;
  }

  const bot = new TelegramBot(token, { polling: true });

  console.log("🤖 Telegram Bot Started");

  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const user = {
      chat_id: chatId,
      username: msg.from.username || null,
      first_name: msg.from.first_name || null,
      last_name: msg.from.last_name || null,
      started_at: new Date().toISOString(),
    };

    /* =========================
       SAVE USER (JSON)
    ========================= */
    let users = [];

    if (fs.existsSync(USERS_FILE)) {
      users = JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
    }

    const alreadyExists = users.find(u => u.chat_id === chatId);

    if (!alreadyExists) {
      users.push(user);
      fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
      console.log("👤 New Telegram User Saved:", chatId);
    }

    /* =========================
       WELCOME MESSAGE
    ========================= */
    await bot.sendMessage(chatId,
      "👋 *Welcome to DPS Wallet*\n\n" +
      "Swap, manage and explore TON ecosystem directly.",
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🚀 Open DPS Wallet",
                web_app: { url: webAppUrl },
              },
            ],
          ],
        },
      }
    );
  });
}