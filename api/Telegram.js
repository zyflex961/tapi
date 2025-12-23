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
  
  const TASKS_FILE = path.join(process.cwd(), "tasks.json");  
  const USERS_FILE = path.join(process.cwd(), "users.json");  
  
  
    
  const load = (file, def = []) => {  
    if (!fs.existsSync(file)) {  
        fs.writeFileSync(file, JSON.stringify(def));  
        return def;  
    }  
    try {  
      const data = fs.readFileSync(file, "utf8");  
      return JSON.parse(data);  
    } catch (err) {  
      return def;  
    }  
  };  
  
  const save = (file, data) =>  
    fs.writeFileSync(file, JSON.stringify(data, null, 2));  
  
  /* =========================  
     PROFILE MESSAGE (Admin Balance Fixed)  
  ========================= */  
  async function sendProfile(ctx, user) {  
    const users = load(USERS_FILE);  
    const freshUser = users.find(u => String(u.chatId) === String(user.chatId));  
      
    // ایڈمن کے لیے بیلنس 1 ملین فکس کر دیا گیا ہے  
    let balance = freshUser ? freshUser.balance : 0;  
    if (String(user.chatId) === String(ADMIN_ID)) {  
      balance = 900000.3840;  
    }  
  
    const referrals = freshUser ? freshUser.referCount : 0;  
    const refLink = `https://t.me/${ctx.botInfo.username}?start=${user.chatId}`;  
      
    // ---- 👆 end of admin profille section 👆 -------  
  
      
    const profileText = `💎 **DPS DIGITAL WALLET PROFILE**  
━━━━━━━━━━━━━━━━━━━━  
🆔 Account ID: ${user.chatId}  
💰 Balance: ${balance} $DPS  
👥 Referrals: ${referrals}  
  
🔗 Referral Link:  
${refLink}  
  
Invite friends and earn 200 DPS per referral. Join our leader ship`;  
  
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
          inviter.balance += 50;  
          inviter.referCount += 1;  
          bonus = 150;  
          bot.telegram.sendMessage(refBy, "🎉 Congratulations 🎉 You earned 200 DPS from a referral!").catch(() => {});  
        }  
      }  
      user = { chatId, username: ctx.from.username || "User", balance: bonus, referCount: 0, completedTasks: [] };  
      users.push(user);  
      save(USERS_FILE, users);  
    }  
  
    await ctx.reply(`👋 Welcome to DPS Digital Wallet your can sending receiving swapping and stacking without any problem`, {  
        reply_markup: {  
          inline_keyboard: [  
            [{ text: "🚀 Open DPS Wallet App", url: WEB_APP_URL }],  
            [{ text: "👤 My Profile", callback_data: "profile" }, { text: "🎁 Tasks", callback_data: "tasks" }],  
            [{ text: "💰 Deposit", callback_data: "deposit" }]  
          ]  
        }  
      }  
    );  
    // خود بخود پروفایل دکھائیں  
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
  INLINE TRANSFER (Admin Unlimited Fixed)   
  ================== */  
  bot.on("inline_query", async (ctx) => {  
    const q = ctx.inlineQuery.query.trim();  
    const match = q.match(/^(\d+)$/i);  
    if (!match) return;  
  
    const amount = parseInt(match[1]);  
    const users = load(USERS_FILE);  
    let sender = users.find(u => String(u.chatId) === String(ctx.from.id));  
      
    // ایڈمن کے لیے چیک ختم کر دیا تاکہ وہ ہمیشہ بھیج سکے  
    let canSend = false;  
    if (String(ctx.from.id) === String(ADMIN_ID)) {  
      canSend = true;  
    } else if (sender && sender.balance >= amount) {  
      canSend = true;  
    }  
  
    if (!canSend) return;  
  
    await ctx.answerInlineQuery([{  
        type: "article",  
        id: `dps_${Date.now()}`,  
        title: `💸 Send ${amount} $DPS `,  
        input_message_content: { message_text: `💸 DPS Transfer\n\nYou are sending ${amount} Dps on ton \nClick the button below to claim. amount and check profile see your total balance.` },  
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
  
    // ایڈمن سے کٹوتی نہیں ہوگی، یوزر سے ہوگی  
    if (String(senderId) !== String(ADMIN_ID)) {  
      if (sIdx === -1 || users[sIdx].balance < amount) return ctx.answerCbQuery("❌ Insufficient balance.");  
      users[sIdx].balance -= amount;  
    }  
  
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
     OTHER LOGIC (TASKS/ADMIN)  
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
    ctx.editMessageText("🎁 Complete tasks to earn DPS:", { reply_markup: { inline_keyboard: buttons } });  
  });  
  
  bot.action(/verify_(.+)/, (ctx) => {  
    const taskId = ctx.match[1];  
    let users = load(USERS_FILE);  
    const task = load(TASKS_FILE).find(t => t.id === taskId);  
    const uIdx = users.findIndex(u => String(u.chatId) === String(ctx.from.id));  
    if (uIdx === -1 || !task || users[uIdx].completedTasks.includes(taskId)) return ctx.answerCbQuery("Already done.");  
    users[uIdx].balance += task.reward;  
    users[uIdx].completedTasks.push(taskId);  
    save(USERS_FILE, users);  
    ctx.reply(`✅ Task completed! +${task.reward} DPS`);  
  });  
  
    
/* ===================================  
 P2P DEPOSIT Section.  
==========================================*/  
  bot.action("deposit", (ctx) => {  
    ctx.reply(" <b>💰 DPS Deposit</b><br><br>Dear User,<br><br>We are currently developing this feature and will be deploying it live very soon for your convenience.<br><br><b>Supported Deposit Methods:</b><br>• Bank Transfer<br>• Crypto Currency<br><br>Thank you for your patience and continued support.<br><b>— DPS Team</b>");  
  });  
  
  bot.command("total", (ctx) => {  
    if (String(ctx.from.id) === String(ADMIN_ID)) ctx.reply(`👥 Total users: ${load(USERS_FILE).length}`);  
  });  
  
  bot.command("addtask", (ctx) => {  
    if (String(ctx.from.id) !== String(ADMIN_ID)) return;  
    const parts = ctx.message.text.split("|");  
    if (parts.length < 5) return ctx.reply("Usage: /addtask |01| join telegram channel| 500| url");  
    const tasks = load(TASKS_FILE);  
    tasks.push({ id: parts[1].trim(), title: parts[2].trim(), reward: parseInt(parts[3]), url: parts[4].trim() });  
    save(TASKS_FILE, tasks);  
    ctx.reply("✅ Task added Successful.");  
  });  
  
  bot.launch();  
  console.log("✅ Telegram Bot Started");  
      }
