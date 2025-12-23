import { Telegraf, Markup } from "telegraf";
import fs from "fs";
import path from "path";
import "dotenv/config";

export default function initEuroBot() {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) return;

  const bot = new Telegraf(BOT_TOKEN);
  const ADMIN_ID = "8230113306"; 
  const WEB_APP_URL = "https://t.me/DPSwallet_bot?startapp";

  const USERS_FILE = path.join(process.cwd(), "api", "users.json");
  const TASKS_FILE = path.join(process.cwd(), "api", "tasks.json");

  // ڈیٹا لوڈ اور سیو کرنے کے فنکشنز
  const load = (file) => {
    try {
      if (!fs.existsSync(file)) return [];
      return JSON.parse(fs.readFileSync(file, "utf8") || "[]");
    } catch (e) { return []; }
  };

  const save = (file, data) => {
    try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); } catch (e) {}
  };

  /* =========================
     PROFILE SYSTEM (Direct from JSON)
  ========================= */
  async function sendProfile(ctx, chatId) {
    const users = load(USERS_FILE);
    const user = users.find(u => String(u.chatId) === String(chatId));

    if (!user) return; // اگر یوزر نہیں ہے تو کچھ نہ کریں

    let adminPanel = "";
    // ایڈمن کے لیے ڈیش بورڈ (صرف ایڈمن کو نظر آئے گا)
    if (String(chatId) === ADMIN_ID) {
      const totalUsers = users.length;
      const totalBalance = users.reduce((sum, u) => sum + (Number(u.balance) || 0), 0);
      adminPanel = `📊 *ADMIN DASHBOARD*\n👥 Total Users: ${totalUsers}\n💰 Total Supply: ${totalBalance.toLocaleString()} DPS\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    }

    const profileText = `💎 **DPS DIGITAL WALLET PROFILE**
━━━━━━━━━━━━━━━━━━━━
${adminPanel}🆔 Account ID: ${chatId}
💰 Balance: ${(user.balance || 0).toLocaleString()} DPS
👥 Referrals: ${user.referCount || 0}

🔗 Referral Link:
https://t.me/${ctx.botInfo.username}?start=${chatId}

Invite friends and earn 200 DPS per referral.`;

    await ctx.reply(profileText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: "🚀 Open DPS Wallet App", url: WEB_APP_URL }],
          [{ text: "🎁 Tasks", callback_data: "tasks" }, { text: "💰 Deposit", callback_data: "deposit" }],
          [{ text: "🔄 Refresh", callback_data: "refresh" }]
        ]
      }
    });
  }

  /* =========================
     /START & REFERRAL (Fast & Optimized)
  ========================= */
  bot.start(async (ctx) => {
    const chatId = String(ctx.chat.id);
    const refBy = ctx.payload;
    let users = load(USERS_FILE);
    let user = users.find(u => String(u.chatId) === chatId);

    if (!user) {
      let bonus = 0;
      if (refBy && String(refBy) !== chatId) {
        const inviter = users.find(u => String(u.chatId) === String(refBy));
        if (inviter) {
          inviter.balance = (inviter.balance || 0) + 200;
          inviter.referCount = (inviter.referCount || 0) + 1;
          bonus = 50;
          bot.telegram.sendMessage(refBy, "🎉 You earned 200 DPS from a referral!").catch(() => {});
        }
      }
      user = { chatId, username: ctx.from.username || "User", balance: bonus, referCount: 0, completedTasks: [] };
      users.push(user);
      save(USERS_FILE, users);
    }

    await ctx.reply(`👋 Welcome to DPS Digital Wallet\nExperience the next generation of digital finance. Seamlessly send, receive, and swap tokens with professional-grade security.\n\n💎 Start building your DPS portfolio today!`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🚀 Open DPS Wallet App", url: WEB_APP_URL }],
          [{ text: "👤 My Profile", callback_data: "profile" }, { text: "🎁 Tasks", callback_data: "tasks" }],
          [{ text: "💰 Deposit", callback_data: "deposit" }]
        ]
      }
    });
    await sendProfile(ctx, chatId);
  });

  bot.action("profile", (ctx) => sendProfile(ctx, ctx.from.id));
  bot.action("refresh", async (ctx) => {
    try { await ctx.deleteMessage(); } catch(e) {}
    sendProfile(ctx, ctx.from.id);
  });

  /* =========================
     INLINE TRANSFER (Unchanged Logic)
  ========================= */
  bot.on("inline_query", async (ctx) => {
    const q = ctx.inlineQuery.query.trim();
    if (!/^\d+$/.test(q)) return;

    const amount = parseInt(q);
    const users = load(USERS_FILE);
    const sender = users.find(u => String(u.chatId) === String(ctx.from.id));

    const canSend = (String(ctx.from.id) === ADMIN_ID) || (sender && sender.balance >= amount);
    if (!canSend) return;

    await ctx.answerInlineQuery([{
      type: "article",
      id: `dps_${Date.now()}`,
      title: `💸 Send ${amount} $DPS`,
      input_message_content: { message_text: `💸 DPS Transfer\n\nYou are sending ${amount} Dps on ton \nClick the button below to claim amount.` },
      reply_markup: { inline_keyboard: [[{ text: "✅ Claim DPS", callback_data: `claim_${amount}_${ctx.from.id}` }]] }
    }], { cache_time: 0 });
  });

  bot.action(/claim_(\d+)_(\d+)/, async (ctx) => {
    const amount = parseInt(ctx.match[1]);
    const senderId = ctx.match[2];
    const receiverId = String(ctx.from.id);

    if (senderId === receiverId) return ctx.answerCbQuery("❌ You cannot claim your own transfer.");

    let users = load(USERS_FILE);
    let sIdx = users.findIndex(u => String(u.chatId) === senderId);

    if (senderId !== ADMIN_ID) {
      if (sIdx === -1 || users[sIdx].balance < amount) return ctx.answerCbQuery("❌ Insufficient balance.");
      users[sIdx].balance -= amount;
    }

    let rIdx = users.findIndex(u => String(u.chatId) === receiverId);
    if (rIdx === -1) {
      users.push({ chatId: receiverId, username: ctx.from.username || "User", balance: amount, referCount: 0, completedTasks: [] });
    } else {
      users[rIdx].balance += amount;
    }

    save(USERS_FILE, users);
    ctx.editMessageText(`✅ Transfer Complete\n\n${amount} DPS transferred successfully.`).catch(()=>{});
    ctx.answerCbQuery("✅ DPS received!");
  });

  /* =========================
     TASKS SYSTEM (Stable)
  ========================= */
  bot.action("tasks", (ctx) => {
    const tasks = load(TASKS_FILE);
    const users = load(USERS_FILE);
    const user = users.find(u => String(u.chatId) === String(ctx.from.id));
    if (!user || !tasks.length) return ctx.answerCbQuery("No tasks available.");

    const buttons = tasks.map(t => {
      const done = (user.completedTasks || []).includes(String(t.id));
      return [
        Markup.button.url(`${t.title || 'Task'} ${done ? "✅" : `(+${t.reward || 0} DPS)`}`, t.url || "#"),
        Markup.button.callback(done ? "Verified" : "Verify", `verify_${t.id}`)
      ];
    });
    ctx.editMessageText("🎁 Complete tasks to earn DPS:", { reply_markup: { inline_keyboard: buttons } });
  });

  bot.action(/verify_(.+)/, (ctx) => {
    const taskId = String(ctx.match[1]);
    let users = load(USERS_FILE);
    const tasks = load(TASKS_FILE);
    const task = tasks.find(t => String(t.id) === taskId);
    const uIdx = users.findIndex(u => String(u.chatId) === String(ctx.from.id));

    if (uIdx === -1 || !task || (users[uIdx].completedTasks || []).includes(taskId)) {
      return ctx.answerCbQuery("Already done or error.");
    }

    users[uIdx].balance = (users[uIdx].balance || 0) + (task.reward || 0);
    if (!users[uIdx].completedTasks) users[uIdx].completedTasks = [];
    users[uIdx].completedTasks.push(taskId);

    save(USERS_FILE, users);
    ctx.answerCbQuery(`✅ +${task.reward} DPS!`);
    ctx.reply(`✅ Task completed! +${task.reward} DPS`);
  });

  bot.action("deposit", (ctx) => {
    ctx.reply("💰 **DPS Deposit**\n\n Dear user, we are currently developing this feature and will deploy it live very soon.");
  });

  bot.launch();
  console.log("🚀 DPS Bot System Live & Fast");
             }
        
