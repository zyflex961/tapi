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
     HELPERS (Fixed Load/Save)
  ========================= */
  const load = (file, def = []) => {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify(def));
        return def;
    }
    try {
      const data = fs.readFileSync(file, "utf8");
      return JSON.parse(data);
    } catch (err) {
      console.log("Read error:", err);
      return def;
    }
  };

  const save = (file, data) =>
    fs.writeFileSync(file, JSON.stringify(data, null, 2));

  /* =========================
     PROFILE MESSAGE (Fixed Data Access)
  ========================= */
  async function sendProfile(ctx, user) {
    // ڈیٹا بیس سے تازہ ترین یوزر ڈیٹا لوڈ کریں
    const users = load(USERS_FILE);
    const freshUser = users.find(u => String(u.chatId) === String(user.chatId));
    
    // اگر یوزر ڈیٹا بیس میں ہے تو اس کا بیلنس اور ریفرل دکھائیں
    const balance = freshUser ? freshUser.balance : 0;
    const referrals = freshUser ? freshUser.referCount : 0;
    const refLink = `https://t.me/${ctx.botInfo.username}?start=${user.chatId}`;

    const profileText = `💎 DPS DIGITAL WALLET
━━━━━━━━━━━━━━━━━━━━

🆔 Account ID: ${user.chatId}
💰 Balance: ${balance} DPS
👥 Referrals: ${referrals}

🔗 Referral Link:
${refLink}

Invite friends and earn 200 DPS per referral.`;

    await ctx.reply(profileText, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🚀 Open DPS Wallet App", url: WEB_APP_URL }],
            [{ text: "🎁 Tasks", callback_data: "tasks" }, { text: "💰 Deposit", callback_data: "deposit" }],
            [{ text: "🔄 Refresh", callback_data: "refresh" }]
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
    let user = users.find(u => String(u.chatId) === String(chatId));

    if (!user) {
      let bonus = 0;
      if (refBy && String(refBy) !== String(chatId)) {
        const inviter = users.find(u => String(u.chatId) === String(refBy));
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
        chatId: chatId,
        username: ctx.from.username || "User",
        balance: bonus,
        referCount: 0,
        completedTasks: []
      };

      users.push(user);
      save(USERS_FILE, users);
    }

    await ctx.reply(`👋 Welcome to DPS Digital Wallet`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🚀 Open DPS Wallet App", url: WEB_APP_URL }],
            [{ text: "👤 My Profile", callback_data: "profile" }, { text: "🎁 Tasks", callback_data: "tasks" }],
            [{ text: "💰 Deposit", callback_data: "deposit" }]
          ]
        }
      }
    );
  });

  /* =========================
     ACTIONS (Logic Intact)
  ========================= */
  bot.action("profile", (ctx) => {
    const users = load(USERS_FILE);
    const user = users.find(u => String(u.chatId) === String(ctx.from.id));
    if (user) sendProfile(ctx, user);
  });

  bot.action("refresh", async (ctx) => {
    const users = load(USERS_FILE);
    const user = users.find(u => String(u.chatId) === String(ctx.from.id));
    try { await ctx.deleteMessage(); } catch(e) {}
    if (user) sendProfile(ctx, user);
  });

  bot.command("profile", (ctx) => {
    const users = load(USERS_FILE);
    const user = users.find(u => String(u.chatId) === String(ctx.chat.id));
    if (user) sendProfile(ctx, user);
  });

  /* =========================
     TASK SYSTEM
  ========================= */
  bot.action("tasks", (ctx) => {
    const tasks = load(TASKS_FILE);
    const users = load(USERS_FILE);
    const user = users.find(u => String(u.chatId) === String(ctx.from.id));

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
    let users = load(USERS_FILE);
    const tasks = load(TASKS_FILE);

    const userIdx = users.findIndex(u => String(u.chatId) === String(ctx.from.id));
    const task = tasks.find(t => t.id === taskId);

    if (userIdx === -1 || !task || users[userIdx].completedTasks.includes(taskId)) {
        return ctx.answerCbQuery("Already completed or invalid.");
    }

    users[userIdx].balance += task.reward;
    users[userIdx].completedTasks.push(taskId);
    save(USERS_FILE, users);

    ctx.answerCbQuery(`✅ +${task.reward} DPS earned!`);
    ctx.reply(`✅ Task completed! +${task.reward} DPS`);
  });

  bot.action("deposit", (ctx) => {
    ctx.reply("💰 DPS Deposit\n\nSend payment proof to admin.\nSupported:\n• Bank Transfer\n• Crypto (USDT TRC20)");
  });

  /* =========================
     INLINE QUERY & CLAIM
  ========================= */
  bot.on("inline_query", async (ctx) => {
    const q = ctx.inlineQuery.query.trim();
    const match = q.match(/^(\d+)$/i); // simplified match
    if (!match) return;

    const amount = parseInt(match[1]);
    const users = load(USERS_FILE);
    let sender = users.find(u => String(u.chatId) === String(ctx.from.id));
    
    if (Number(ctx.from.id) === ADMIN_ID && !sender) {
        sender = { balance: 999999 }; // Admin fallback
    }

    if (!sender || sender.balance < amount) return;

    await ctx.answerInlineQuery([{
        type: "article",
        id: `dps_${Date.now()}`,
        title: `💸 Send ${amount} DPS`,
        input_message_content: { message_text: `💸 DPS Transfer\n\nYou are sending ${amount} DPS.\nClick the button below to claim.` },
        reply_markup: { inline_keyboard: [[{ text: "✅ Claim DPS", callback_data: `claim_${amount}_${ctx.from.id}` }]] }
    }], { cache_time: 0 });
  });

  bot.action(/claim_(\d+)_(\d+)/, async (ctx) => {
    const amount = parseInt(ctx.match[1]);
    const senderId = ctx.match[2];
    const receiverId = ctx.from.id;

    if (String(senderId) === String(receiverId)) return ctx.answerCbQuery("❌ You cannot claim your own transfer.");

    let users = load(USERS_FILE);
    let sIdx = users.findIndex(u => String(u.chatId) === String(senderId));
    let rIdx = users.findIndex(u => String(u.chatId) === String(receiverId));

    if (sIdx === -1 && Number(senderId) !== ADMIN_ID) return ctx.answerCbQuery("❌ Sender not found.");
    if (sIdx !== -1 && users[sIdx].balance < amount && Number(senderId) !== ADMIN_ID) return ctx.answerCbQuery("❌ Insufficient balance.");

    if (rIdx === -1) {
      users.push({ chatId: receiverId, username: ctx.from.username || "User", balance: 0, referCount: 0, completedTasks: [] });
      rIdx = users.length - 1;
    }

    if (Number(senderId) !== ADMIN_ID) users[sIdx].balance -= amount;
    users[rIdx].balance += amount;
    save(USERS_FILE, users);

    ctx.editMessageText(`✅ Transfer Complete\n\n${amount} DPS transferred successfully.`).catch(()=>{});
    ctx.answerCbQuery("✅ DPS received!");
  });

  /* =========================
     ADMIN
  ========================= */
  bot.command("total", (ctx) => {
    if (Number(ctx.from.id) === ADMIN_ID) ctx.reply(`👥 Total users: ${load(USERS_FILE).length}`);
  });

  bot.command("addtask", (ctx) => {
    if (Number(ctx.from.id) !== ADMIN_ID) return;
    const parts = ctx.message.text.split("|");
    if (parts.length < 5) return ctx.reply("Usage: /addtask|id|title|reward|url");
    const tasks = load(TASKS_FILE);
    tasks.push({ id: parts[1].trim(), title: parts[2].trim(), reward: parseInt(parts[3]), url: parts[4].trim() });
    save(TASKS_FILE, tasks);
    ctx.reply("✅ Task added.");
  });

  bot.launch();
  console.log("✅ Telegram Bot Started");
}
