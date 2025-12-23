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

  // پاتھ کو ڈائنامک اور درست کر دیا گیا ہے
  const USERS_FILE = path.join(process.cwd(), "api", "users.json");
  const TASKS_FILE = path.join(process.cwd(), "api", "tasks.json");

  const load = (file, def = []) => {
    if (!fs.existsSync(file)) {
      try {
        fs.writeFileSync(file, JSON.stringify(def));
        return def;
      } catch (e) { return def; }
    }
    try {
      const data = fs.readFileSync(file, "utf8");
      return JSON.parse(data);
    } catch (err) { return def; }
  };

  const save = (file, data) =>
    fs.writeFileSync(file, JSON.stringify(data, null, 2));

  /* =========================
     PROFILE MESSAGE (Professional Admin Dashboard)
  ========================= */
  async function sendProfile(ctx, user) {
    const users = load(USERS_FILE);
    const freshUser = users.find(u => String(u.chatId) === String(user.chatId));
    
    let balance = freshUser ? freshUser.balance : 0;
    let adminPanel = "";

    // اگر ایڈمن ہے تو پروفیشنل اسٹیٹس دکھائیں
    if (String(user.chatId) === String(ADMIN_ID)) {
      balance = 9012800; // ایڈمن فکس بیلنس
      
      const totalUsers = users.length;
      const totalSystemBalance = users.reduce((sum, u) => sum + (Number(u.balance) || 0), 0);

      adminPanel = `📊 *ADMINISTRATOR DASHBOARD*
👥 Total Active Users: ${totalUsers.toLocaleString()}
💰 Total Circulating Supply: ${totalSystemBalance.toLocaleString()} DPS
━━━━━━━━━━━━━━━━━━━━\n\n`;
    }

    const referrals = freshUser ? freshUser.referCount : 0;
    const refLink = `https://t.me/${ctx.botInfo.username}?start=${user.chatId}`;
    
    const profileText = `💎 *DPS DIGITAL WALLET PROFILE*
━━━━━━━━━━━━━━━━━━━━
${adminPanel}👤 *Account Status:* Verified
🆔 *Account ID:* \`${user.chatId}\`
💰 *Available Balance:* ${balance.toLocaleString()} DPS
👥 *Total Referrals:* ${referrals}

🔗 *Your Referral Link:*
${refLink}

_Share your link to earn 200 DPS for every successful invite._`;

    await ctx.reply(profileText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: "🚀 Open DPS Wallet App", url: WEB_APP_URL }],
            [{ text: "🎁 Earn Tasks", callback_data: "tasks" }, { text: "💰 Deposit", callback_data: "deposit" }],
            [{ text: "🔄 Refresh Data", callback_data: "refresh" }]
          ]
        }
      }
    );
  }

  /* =========================
     /START (Professional Welcome)
  ========================= */
  bot.start(async (ctx) => {
    const chatId = ctx.chat.id;
    const refBy = ctx.payload;
    let users = load(USERS_FILE);
    let user = users.find(u => String(u.chatId) === String(chatId));

    if (!user) {
      let bonus = 0;
      if (refBy && String(refBy) !== String(chatId)) {
        const inviterIndex = users.findIndex(u => String(u.chatId) === String(refBy));
        if (inviterIndex !== -1) {
          users[inviterIndex].balance += 200;
          users[inviterIndex].referCount += 1;
          bonus = 50;
          bot.telegram.sendMessage(refBy, "🎉 *Referral Bonus!* You've received 200 DPS.", { parse_mode: 'Markdown' }).catch(() => {});
        }
      }
      user = { chatId, username: ctx.from.username || "User", balance: bonus, referCount: 0, completedTasks: [] };
      users.push(user);
      save(USERS_FILE, users);
    }

    const welcomeMsg = `👋 *Welcome to DPS Digital Wallet*

Experience the next generation of digital finance. Seamlessly send, receive, and swap tokens with professional-grade security and blazing-fast speed.

💎 *Start building your DPS portfolio today!*`;

    await ctx.reply(welcomeMsg, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: "🚀 Launch Wallet App", url: WEB_APP_URL }],
            [{ text: "👤 My Profile", callback_data: "profile" }, { text: "🎁 Bonus Tasks", callback_data: "tasks" }],
            [{ text: "💰 Secure Deposit", callback_data: "deposit" }]
          ]
        }
      }
    );
    await sendProfile(ctx, user);
  });

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

  /* =================
  INLINE TRANSFER
  ================== */
  bot.on("inline_query", async (ctx) => {
    const q = ctx.inlineQuery.query.trim();
    if (!/^\d+$/.test(q)) return;
    const amount = parseInt(q);
    const users = load(USERS_FILE);
    let sender = users.find(u => String(u.chatId) === String(ctx.from.id));
    let canSend = (String(ctx.from.id) === String(ADMIN_ID)) || (sender && sender.balance >= amount);
    if (!canSend) return;

    await ctx.answerInlineQuery([{
        type: "article", id: `dps_${Date.now()}`, title: `💸 Transfer ${amount} DPS`,
        input_message_content: { message_text: `💸 *DPS Secure Transfer*\n\nAmount: ${amount} DPS\nStatus: Pending Claim\n\n_Click the button below to credit this to your account._`, parse_mode: 'Markdown' },
        reply_markup: { inline_keyboard: [[{ text: "✅ Claim DPS Now", callback_data: `claim_${amount}_${ctx.from.id}` }]] }
    }], { cache_time: 0 });
  });

  bot.action(/claim_(\d+)_(\d+)/, async (ctx) => {
    const amount = parseInt(ctx.match[1]);
    const senderId = ctx.match[2];
    const receiverId = ctx.from.id;
    if (String(senderId) === String(receiverId)) return ctx.answerCbQuery("❌ You cannot claim your own transfer.");

    let users = load(USERS_FILE);
    let sIdx = users.findIndex(u => String(u.chatId) === String(senderId));
    if (String(senderId) !== String(ADMIN_ID)) {
      if (sIdx === -1 || users[sIdx].balance < amount) return ctx.answerCbQuery("❌ Insufficient sender balance.");
      users[sIdx].balance -= amount;
    }
    let rIdx = users.findIndex(u => String(u.chatId) === String(receiverId));
    if (rIdx === -1) {
      users.push({ chatId: receiverId, username: ctx.from.username || "User", balance: amount, referCount: 0, completedTasks: [] });
    } else {
      users[rIdx].balance += amount;
    }
    save(USERS_FILE, users);
    ctx.editMessageText(`✅ *Transfer Successful*\n\n${amount} DPS has been added to your wallet.`, { parse_mode: 'Markdown' }).catch(()=>{});
    ctx.answerCbQuery("💰 Tokens Claimed!");
  });

  /* =========================
     TASKS SYSTEM
  ========================= */
  bot.action("tasks", (ctx) => {
    const tasks = load(TASKS_FILE);
    const users = load(USERS_FILE);
    const user = users.find(u => String(u.chatId) === String(ctx.from.id));
    if (!tasks.length) return ctx.answerCbQuery("No active tasks available.");
    const buttons = tasks.map(t => {
      const done = user.completedTasks.includes(String(t.id));
      const btnText = done ? `${t.type || 'Task'} ✅` : `${t.type || 'Task'} (+${t.reward_amount || t.reward} DPS)`;
      return [
        Markup.button.url(btnText, t.link || t.url),
        Markup.button.callback(done ? "Verified" : "Verify ✅", `verify_${t.id}`)
      ];
    });
    ctx.editMessageText("🎁 *DPS Reward Tasks*\nComplete the following missions to earn free tokens:", { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
  });

  bot.action(/verify_(.+)/, (ctx) => {
    const taskId = ctx.match[1];
    let users = load(USERS_FILE);
    const tasks = load(TASKS_FILE);
    const task = tasks.find(t => String(t.id) === String(taskId));
    const uIdx = users.findIndex(u => String(u.chatId) === String(ctx.from.id));
    if (uIdx === -1 || !task || users[uIdx].completedTasks.includes(String(taskId))) return ctx.answerCbQuery("Already verified.");
    users[uIdx].balance += (task.reward_amount || task.reward);
    users[uIdx].completedTasks.push(String(taskId));
    save(USERS_FILE, users);
    ctx.reply(`✅ *Verification Success!*\nYou've earned +${task.reward_amount || task.reward} DPS.`, { parse_mode: 'Markdown' });
  });

  bot.action("deposit", (ctx) => {
    ctx.reply("💰 *DPS Deposit Gateways*\n\nWe are currently integrating automated Bank & Crypto gateways. Please check back soon.\n\n_Support: @AdminUsername_", { parse_mode: 'Markdown' });
  });

  bot.launch();
  console.log("✅ DPS Professional Bot Started");
}
