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
  const WEB_APP_URL = "https://walletdps.vercel.app";

  const USERS_FILE = path.join(process.cwd(), "api", "users.json");
  const TASKS_FILE = path.join(process.cwd(), "api", "tasks.json");

  /* =========================
     FILE HELPERS
  ========================= */
  const load = (file, def = []) => {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(def, null, 2));
      return def;
    }
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return def;
    }
  };

  const save = (file, data) =>
    fs.writeFileSync(file, JSON.stringify(data, null, 2));

  /* =========================
     PROFILE
  ========================= */
  async function sendProfile(ctx, user) {
    const users = load(USERS_FILE);
    const freshUser = users.find(u => String(u.chatId) === String(user.chatId));

    let balance = freshUser ? freshUser.balance : 0;
    if (String(user.chatId) === String(ADMIN_ID)) {
      balance = 9012800;
    }

    const referrals = freshUser ? freshUser.referCount : 0;
    const refLink = `https://t.me/${ctx.botInfo.username}?start=${user.chatId}`;

    const text =
`💎 DPS DIGITAL WALLET PROFILE
━━━━━━━━━━━━━━━━━━━━
🆔 Account ID: ${user.chatId}
💰 Balance: ${balance} DPS
👥 Referrals: ${referrals}

🔗 Referral Link:
${refLink}

Invite friends and earn 200 DPS per referral.`;

    await ctx.reply(text, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🚀 Open DPS Wallet App", url: WEB_APP_URL }],
          [
            { text: "🎁 Tasks", callback_data: "tasks" },
            { text: "💰 Deposit", callback_data: "deposit" }
          ],
          [{ text: "🔄 Refresh", callback_data: "refresh" }]
        ]
      }
    });
  }

  /* =========================
     START + REFERRAL
  ========================= */
  bot.start(async (ctx) => {
    const chatId = ctx.chat.id;
    const refBy = ctx.payload;

    let users = load(USERS_FILE);
    let user = users.find(u => String(u.chatId) === String(chatId));

    if (!user) {
      let bonus = 0;

      if (refBy && refBy !== String(chatId)) {
        const inviter = users.find(u => String(u.chatId) === String(refBy));
        if (inviter) {
          inviter.balance += 200;
          inviter.referCount += 1;
          bonus = 50;
          bot.telegram.sendMessage(refBy, "🎉 You earned 200 DPS from a referral!").catch(()=>{});
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
      "👋 Welcome to DPS Digital Wallet",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🚀 Open DPS Wallet App", url: WEB_APP_URL }],
            [
              { text: "👤 My Profile", callback_data: "profile" },
              { text: "🎁 Tasks", callback_data: "tasks" }
            ],
            [{ text: "💰 Deposit", callback_data: "deposit" }]
          ]
        }
      }
    );

    await sendProfile(ctx, user);
  });

  bot.action("profile", async (ctx) => {
    const user = load(USERS_FILE).find(u => String(u.chatId) === String(ctx.from.id));
    if (user) await sendProfile(ctx, user);
  });

  bot.action("refresh", async (ctx) => {
    try { await ctx.deleteMessage(); } catch {}
    const user = load(USERS_FILE).find(u => String(u.chatId) === String(ctx.from.id));
    if (user) await sendProfile(ctx, user);
  });

  /* =========================
     INLINE DPS TRANSFER
  ========================= */
  bot.on("inline_query", async (ctx) => {
    const q = ctx.inlineQuery.query.trim();
    if (!/^\d+$/.test(q)) return;

    const amount = parseInt(q);
    const users = load(USERS_FILE);
    const sender = users.find(u => String(u.chatId) === String(ctx.from.id));

    if (
      String(ctx.from.id) !== String(ADMIN_ID) &&
      (!sender || sender.balance < amount)
    ) return;

    await ctx.answerInlineQuery([{
      type: "article",
      id: String(Date.now()),
      title: `💸 Send ${amount} DPS`,
      input_message_content: {
        message_text: `💸 DPS Transfer\n\nAmount: ${amount} DPS`
      },
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ Claim DPS", callback_data: `claim_${amount}_${ctx.from.id}` }]
        ]
      }
    }], { cache_time: 0 });
  });

  bot.action(/claim_(\d+)_(\d+)/, async (ctx) => {
    const amount = parseInt(ctx.match[1]);
    const senderId = ctx.match[2];
    const receiverId = ctx.from.id;

    if (String(senderId) === String(receiverId))
      return ctx.answerCbQuery("❌ You cannot claim your own transfer.");

    let users = load(USERS_FILE);
    let sender = users.find(u => String(u.chatId) === String(senderId));
    let receiver = users.find(u => String(u.chatId) === String(receiverId));

    if (String(senderId) !== String(ADMIN_ID)) {
      if (!sender || sender.balance < amount)
        return ctx.answerCbQuery("❌ Insufficient balance.");
      sender.balance -= amount;
    }

    if (!receiver) {
      receiver = {
        chatId: receiverId,
        username: ctx.from.username || "User",
        balance: amount,
        referCount: 0,
        completedTasks: []
      };
      users.push(receiver);
    } else {
      receiver.balance += amount;
    }

    save(USERS_FILE, users);
    ctx.editMessageText(`✅ ${amount} DPS received successfully`);
    ctx.answerCbQuery("Success");
  });

  /* =========================
     TASKS
  ========================= */
  bot.action("tasks", async (ctx) => {
    const tasks = load(TASKS_FILE);
    const users = load(USERS_FILE);
    const user = users.find(u => String(u.chatId) === String(ctx.from.id));

    if (!tasks.length)
      return ctx.answerCbQuery("No tasks available");

    const keyboard = tasks.map(t => {
      const done = user.completedTasks.includes(t.id);
      return [
        [
          { text: `${t.title} ${done ? "✅" : `(+${t.reward})`}`, url: t.url },
          { text: done ? "Done" : "Verify", callback_data: `verify_${t.id}` }
        ]
      ];
    });

    ctx.editMessageText("🎁 Complete tasks:", {
      reply_markup: { inline_keyboard: keyboard }
    });
  });

  bot.action(/verify_(.+)/, async (ctx) => {
    const taskId = ctx.match[1];
    const tasks = load(TASKS_FILE);
    const task = tasks.find(t => t.id === taskId);
    let users = load(USERS_FILE);
    const user = users.find(u => String(u.chatId) === String(ctx.from.id));

    if (!task || user.completedTasks.includes(taskId))
      return ctx.answerCbQuery("Already completed");

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
      "💰 DPS Deposit\n\nThis feature is under development.\nSupported soon: Bank & Crypto"
    );
  });

  bot.command("total", (ctx) => {
    if (String(ctx.from.id) === String(ADMIN_ID)) {
      ctx.reply(`👥 Total users: ${load(USERS_FILE).length}`);
    }
  });

  bot.command("addtask", (ctx) => {
    if (String(ctx.from.id) !== String(ADMIN_ID)) return;

    const parts = ctx.message.text.split("|");
    if (parts.length < 5)
      return ctx.reply("Usage: /addtask |id| title| reward| url");

    const tasks = load(TASKS_FILE);
    tasks.push({
      id: parts[1].trim(),
      title: parts[2].trim(),
      reward: parseInt(parts[3]),
      url: parts[4].trim()
    });

    save(TASKS_FILE, tasks);
    ctx.reply("✅ Task added");
  });

  bot.launch();
  console.log("✅ DPS Telegram Bot Started");
       }
