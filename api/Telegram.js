import { Telegraf, Markup } from "telegraf";
import fs from "fs";
import path from "path";
import "dotenv/config";

export default function initEuroBot() {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) return console.log("❌ BOT_TOKEN missing");

  const bot = new Telegraf(BOT_TOKEN);
  const ADMIN_ID = 8230113306;
  const WEB_APP_URL = "https://walletdps.vercel.app";

  const USERS_FILE = path.join(process.cwd(), "api", "users.json");
  const TASKS_FILE = path.join(process.cwd(), "api", "tasks.json");

  // لوڈ فنکشن کو بہتر بنایا گیا ہے
  const load = (file, def = []) => {
    try {
      if (!fs.existsSync(file)) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(def));
        return def;
      }
      const data = fs.readFileSync(file, "utf8");
      return JSON.parse(data || "[]");
    } catch (err) {
      console.log("Read error:", err.message);
      return def;
    }
  };

  const save = (file, data) => {
    try {
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch (err) { console.log("Save error:", err.message); }
  };

  // یوزر تلاش کرنے یا نیا بنانے کا فنکشن (تاکہ 'undefined' کا ایرر نہ آئے)
  const getOrRegisterUser = (chatId, username, users) => {
    let user = users.find(u => String(u.chatId) === String(chatId));
    if (!user) {
      user = { 
        chatId: String(chatId), 
        username: username || "User", 
        balance: 0, 
        referCount: 0, 
        completedTasks: [] 
      };
      users.push(user);
      save(USERS_FILE, users);
    }
    // اگر پرانے یوزر میں completedTasks نہ ہو تو اسے ایڈ کریں
    if (!user.completedTasks) user.completedTasks = [];
    return user;
  };

  /* =========================
     PROFILE MESSAGE
  ========================= */
  async function sendProfile(ctx, chatId) {
    const users = load(USERS_FILE);
    const user = getOrRegisterUser(chatId, ctx.from.username, users);
    
    let balance = user.balance || 0;
    let adminPanel = "";

    if (String(chatId) === String(ADMIN_ID)) {
      balance = 9012800; // ایڈمن فکس بیلنس
      const totalUsers = users.length;
      const totalSystemBalance = users.reduce((sum, u) => sum + (Number(u.balance) || 0), 0);

      adminPanel = `📊 *ADMINISTRATOR DASHBOARD*\n👥 Total Users: ${totalUsers}\n💰 Total Supply: ${totalSystemBalance.toLocaleString()} DPS\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    }

    const profileText = `💎 *DPS DIGITAL WALLET PROFILE*
━━━━━━━━━━━━━━━━━━━━
${adminPanel}🆔 *Account ID:* \`${chatId}\`
💰 *Available Balance:* ${balance.toLocaleString()} DPS
👥 *Total Referrals:* ${user.referCount || 0}

🔗 *Your Referral Link:*
https://t.me/${ctx.botInfo.username}?start=${chatId}

_Invite friends and earn 200 DPS bonus!_`;

    await ctx.reply(profileText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: "🚀 Open DPS Wallet App", url: WEB_APP_URL }],
          [{ text: "🎁 Earn Tasks", callback_data: "tasks" }, { text: "💰 Deposit", callback_data: "deposit" }],
          [{ text: "🔄 Refresh Data", callback_data: "refresh" }]
        ]
      }
    });
  }

  /* =========================
     BOT COMMANDS & ACTIONS
  ========================= */
  bot.start(async (ctx) => {
    const chatId = String(ctx.chat.id);
    const refBy = ctx.payload;
    let users = load(USERS_FILE);
    
    // یوزر رجسٹریشن چیک
    let user = users.find(u => String(u.chatId) === chatId);
    if (!user) {
      let bonus = 0;
      if (refBy && String(refBy) !== chatId) {
        const inviter = users.find(u => String(u.chatId) === String(refBy));
        if (inviter) {
          inviter.balance = (inviter.balance || 0) + 200;
          inviter.referCount = (inviter.referCount || 0) + 1;
          bonus = 50;
          bot.telegram.sendMessage(refBy, "🎉 *Referral Bonus!* +200 DPS", { parse_mode: 'Markdown' }).catch(()=>{});
        }
      }
      user = getOrRegisterUser(chatId, ctx.from.username, users);
      user.balance = bonus;
      save(USERS_FILE, users);
    }

    await ctx.reply(`👋 *Welcome to DPS Digital Wallet*\n\nYour secure gateway to decentralized finance.`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: "🚀 Launch Wallet App", url: WEB_APP_URL }],
          [{ text: "👤 My Profile", callback_data: "profile" }, { text: "🎁 Bonus Tasks", callback_data: "tasks" }]
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

  bot.action("tasks", async (ctx) => {
    const tasks = load(TASKS_FILE);
    const users = load(USERS_FILE);
    const user = getOrRegisterUser(ctx.from.id, ctx.from.username, users);

    if (!tasks.length) return ctx.answerCbQuery("No tasks available.");

    const buttons = tasks.map(t => {
      const done = (user.completedTasks || []).includes(String(t.id));
      return [
        Markup.button.url(`${t.type || 'Task'} ${done ? "✅" : `(+${t.reward_amount || t.reward} DPS)`}`, t.link || t.url),
        Markup.button.callback(done ? "Verified" : "Verify", `verify_${t.id}`)
      ];
    });

    await ctx.editMessageText("🎁 *DPS Reward Tasks*:", {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons }
    }).catch(() => ctx.answerCbQuery("Error loading tasks."));
  });

  bot.action(/verify_(.+)/, (ctx) => {
    const taskId = ctx.match[1];
    let users = load(USERS_FILE);
    const task = load(TASKS_FILE).find(t => String(t.id) === String(taskId));
    const user = getOrRegisterUser(ctx.from.id, ctx.from.username, users);

    if (!task || user.completedTasks.includes(String(taskId))) {
      return ctx.answerCbQuery("Already verified or invalid task.");
    }

    user.balance += (task.reward_amount || task.reward || 0);
    user.completedTasks.push(String(taskId));
    save(USERS_FILE, users);
    ctx.answerCbQuery("✅ Reward Added!");
    ctx.reply(`✅ *Success!* You've earned +${task.reward_amount || task.reward} DPS.`, { parse_mode: 'Markdown' });
  });

  bot.action("deposit", (ctx) => ctx.reply("💰 *Deposit Feature:* Coming Soon!"));

  bot.launch();
  console.log("🚀 DPS Professional Bot Fixed & Started");
      }
                                             
