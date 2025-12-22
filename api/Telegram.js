import { Telegraf, Markup } from "telegraf";
import fs from "fs";
import path from "path";
import "dotenv/config";

export default function initEuroBot() {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) {
    console.log("❌ BOT_TOKEN missing");
    return;
  }

  const bot = new Telegraf(BOT_TOKEN);

  const ADMIN_ID = 8230113306;
  const WEB_APP_URL = "https://t.me/DPSwallet_bot?startapp";

  const USERS_FILE = path.join(process.cwd(), "users.json");
  const TASKS_FILE = path.join(process.cwd(), "tasks.json");

  /* =========================
     HELPERS
  ========================= */
  const load = (file, def = []) => {
    if (!fs.existsSync(file)) return def;
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return def;
    }
  };

  const save = (file, data) =>
    fs.writeFileSync(file, JSON.stringify(data, null, 2));

  /* =========================
     PROFILE MESSAGE
  ========================= */
  async function sendProfile(ctx, user) {
    const users = load(USERS_FILE); // always fresh load
    const freshUser = users.find(u => Number(u.chatId) === Number(user.chatId));
    const balance = freshUser ? freshUser.balance : 0;
    const refLink = `https://t.me/${ctx.botInfo.username}?start=${user.chatId}`;

    await ctx.reply(
      `💎 DPS DIGITAL WALLET
━━━━━━━━━━━━━━━━━━━━

🆔 Account ID: ${user.chatId}
💰 Balance: ${balance} DPS
👥 Referrals: ${user.referCount}

🔗 Referral Link:
${refLink}

Invite friends and earn 200 DPS per referral.`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🚀 Open DPS Wallet App",
                url: WEB_APP_URL
              }
            ],
            [
              { text: "🎁 Tasks", callback_data: "tasks" },
              { text: "💰 Deposit", callback_data: "deposit" }
            ],
            [
              { text: "🔄 Refresh", callback_data: "refresh" }
            ]
          ]
        }
      }
    );
  }

  /* =========================
     /START + REFERRAL
  ========================= */
  bot.start(async (ctx) => {
    const chatId = ctx.chat.id;
    const refBy = ctx.payload;

    let users = load(USERS_FILE);
    let user = users.find(u => Number(u.chatId) === Number(chatId));

    if (!user) {
      let bonus = 0;

      if (refBy && refBy != chatId) {
        const inviter = users.find(u => Number(u.chatId) === Number(refBy));
        if (inviter) {
          inviter.balance += 200;
          inviter.referCount += 1;
          bonus = 50;

          bot.telegram
            .sendMessage(refBy, "🎉 You earned 200 DPS from a referral!")
            .catch(() => {});
        }
      }

      user = {
        chatId,
        username: ctx.from.username || "User",
        balance: bonus,
        referCount: 0,
        completedTasks: []
      };

      users.push(user);
      save(USERS_FILE, users);
    }

    await ctx.reply(
      `👋 Welcome to DPS Digital Wallet

Earn DPS via:
• Referrals
• Tasks
• P2P Transfers

Use the buttons below to continue.`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🚀 Open DPS Wallet App",
                url: WEB_APP_URL
              }
            ],
            [
              { text: "👤 My Profile", callback_data: "profile" },
              { text: "🎁 Tasks", callback_data: "tasks" }
            ],
            [
              { text: "💰 Deposit", callback_data: "deposit" }
            ]
          ]
        }
      }
    );
  });

  /* =========================
     BASIC COMMANDS
  ========================= */
  bot.command("profile", (ctx) => {
    const user = load(USERS_FILE).find(u => Number(u.chatId) === Number(ctx.chat.id));
    if (user) sendProfile(ctx, user);
  });

  bot.command("tasks", (ctx) => ctx.reply("Use the Tasks button."));
  bot.command("deposit", (ctx) => ctx.reply("Use the Deposit button."));

  bot.action("profile", (ctx) => {
    const user = load(USERS_FILE).find(u => Number(u.chatId) === Number(ctx.from.id));
    if (user) sendProfile(ctx, user);
  });

  bot.action("refresh", (ctx) => {
    const user = load(USERS_FILE).find(u => Number(u.chatId) === Number(ctx.from.id));
    if (user) sendProfile(ctx, user);
  });

  /* =========================
     TASK SYSTEM
  ========================= */
  bot.action("tasks", (ctx) => {
    const tasks = load(TASKS_FILE);
    const users = load(USERS_FILE);
    const user = users.find(u => Number(u.chatId) === Number(ctx.from.id));

    if (!tasks.length) return ctx.answerCbQuery("No tasks available.");

    const buttons = tasks.map(t => {
      const done = user.completedTasks.includes(t.id);
      return [
        Markup.button.url(`${t.title} ${done ? "✅" : `(+${t.reward} DPS)`}`, t.url),
        Markup.button.callback(done ? "Verified" : "Verify", `verify_${t.id}`)
      ];
    });

    ctx.editMessageText("🎁 Complete tasks to earn DPS:", {
      reply_markup: { inline_keyboard: buttons }
    });
  });

  bot.action(/verify_(.+)/, (ctx) => {
    const taskId = ctx.match[1];
    const users = load(USERS_FILE);
    const tasks = load(TASKS_FILE);

    const user = users.find(u => Number(u.chatId) === Number(ctx.from.id));
    const task = tasks.find(t => t.id === taskId);

    if (!task || user.completedTasks.includes(taskId)) return ctx.answerCbQuery("Already completed.");

    user.balance += task.reward;
    user.completedTasks.push(taskId);
    save(USERS_FILE, users);

    ctx.reply(`✅ Task completed! +${task.reward} DPS`);
  });

  /* =========================
     DEPOSIT
  ========================= */
  bot.action("deposit", (ctx) => {
    ctx.reply(
      `💰 DPS Deposit

Send payment proof to admin.
Supported:
• Bank Transfer
• Crypto (USDT TRC20)`
    );
  });

  /* =========================
     INLINE P2P TRANSFER (FIXED)
  ========================= */
  bot.on("inline_query", async (ctx) => {
    const q = ctx.inlineQuery.query.trim();
    const match = q.match(/^(\d+)\s*dps?$/i);
    if (!match) return ctx.answerInlineQuery([], { cache_time: 1 });

    const amount = parseInt(match[1]);
    if (amount <= 0) return;

    const users = load(USERS_FILE);
    let sender = users.find(u => Number(u.chatId) === Number(ctx.from.id));
    if (!sender) return ctx.answerInlineQuery([], { cache_time: 1 });

    // Admin fixed balance override
    if (Number(ctx.from.id) === ADMIN_ID) sender.balance = 1000000;

    if (sender.balance < amount) return ctx.answerInlineQuery([], { cache_time: 1 });

    await ctx.answerInlineQuery([
      {
        type: "article",
        id: `dps_${Date.now()}`,
        title: `💸 Send ${amount} DPS`,
        input_message_content: {
          message_text: `💸 DPS Transfer\n\nYou are sending ${amount} DPS.\nClick the button below to claim.`
        },
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Claim DPS", callback_data: `claim_${amount}_${ctx.from.id}` }
            ]
          ]
        }
      }
    ], { cache_time: 0 });
  });

  bot.action(/claim_(\d+)_(\d+)/, async (ctx) => {
    const amount = parseInt(ctx.match[1]);
    const senderId = parseInt(ctx.match[2]);
    const receiverId = ctx.from.id;

    if (senderId === receiverId) return ctx.answerCbQuery("❌ You cannot claim your own transfer.");

    let users = load(USERS_FILE);
    let sender = users.find(u => Number(u.chatId) === Number(senderId));
    let receiver = users.find(u => Number(u.chatId) === Number(receiverId));

    if (!sender) return ctx.answerCbQuery("❌ Sender not found.");
    if (sender.balance < amount) return ctx.answerCbQuery("❌ Insufficient balance.");

    if (!receiver) {
      receiver = {
        chatId: receiverId,
        username: ctx.from.username || "User",
        balance: 0,
        referCount: 0,
        completedTasks: []
      };
      users.push(receiver);
    }

    sender.balance -= amount;
    receiver.balance += amount;
    save(USERS_FILE, users);

    try {
      await ctx.editMessageText(`✅ Transfer Complete\n\n${amount} DPS transferred successfully.`);
    } catch (e) {}

    await ctx.answerCbQuery("✅ DPS received!");
  });

  /* =========================
     ADMIN COMMANDS
  ========================= */
  bot.command("addtask", (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const parts = ctx.message.text.split("|");
    if (parts.length < 5) return ctx.reply("Usage: /addtask|id|title|reward|url");

    const [, id, title, reward, url] = parts;
    const tasks = load(TASKS_FILE);
    tasks.push({ id: id.trim(), title: title.trim(), reward: parseInt(reward), url: url.trim() });
    save(TASKS_FILE, tasks);
    ctx.reply("✅ Task added.");
  });

  bot.command("total", (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    ctx.reply(`👥 Total users: ${load(USERS_FILE).length}`);
  });

  /* =========================
     START BOT
  ========================= */
  bot.launch();
  console.log("✅ Telegram Bot Started");

  process.once("SIGTERM", () => bot.stop("SIGTERM"));
  process.once("SIGINT", () => bot.stop("SIGINT"));
}