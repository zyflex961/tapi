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
  
      
    const profileText = `💎 DPS DIGITAL WALLET PROFILE  
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
    } ;
  
    
      
  await ctx.telegram.sendMessage(
  ctx.chat.id,
  "<b>👋 Welcome to DPS Digital Wallet</b>\n\nSecure platform to send, receive, swap and stake digital assets.",
  {
    parse_mode: "HTML",
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

    /* ========================================================
     PRO DPS INLINE TRANSFER SYSTEM (COMPLETE BLOCK)
  =========================================================== */

  // 1. ان لائن کوئری (جب یوزر ٹائپ کرتا ہے: @bot 100)
  bot.on("inline_query", async (ctx) => {  
    const q = ctx.inlineQuery.query.trim();  
    const match = q.match(/^(\d+)$/i);  
    if (!match) return;  

    const amount = parseInt(match[1]);  
    const senderName = ctx.from.first_name || "User"; // سینڈر کا نام

    const users = load(USERS_FILE);  
    let sender = users.find(u => String(u.chatId) === String(ctx.from.id));  

    // ایڈمن یا بیلنس رکھنے والا یوزر ہی بھیج سکے گا
    let canSend = (String(ctx.from.id) === String(ADMIN_ID)) || (sender && sender.balance >= amount);  
    if (!canSend) return;  

    await ctx.answerInlineQuery([{  
        type: "article",  
        id: `dps_${Date.now()}`,  
        title: `💸 Send ${amount} $DPS`,  
        description: `Create a professional transfer of ${amount} DPS`,
        thumb_url: "https://walletdp-web.vercel.app/dpslogo.png",
        thumb_width: 100,
        thumb_height: 100,
        input_message_content: { 
          message_text: `💎 <b>DPS DIGITAL TRANSFER</b>\n━━━━━━━━━━━━━━━━━━━━\n👤 <b>Sender:</b> ${senderName}\n💰 <b>Amount:</b> ${amount} $DPS\n\n<i>Click the button below to claim these assets safely.</i>`,
          parse_mode: "HTML"
        },  
        reply_markup: { 
          inline_keyboard: [[{ text: "✅ Claim DPS", callback_data: `claim_${amount}_${ctx.from.id}_${senderName}` }]] 
        }  
    }], { cache_time: 0 });  
  });

  // 2. کلیم ایکشن (جب رسیور بٹن دباتا ہے اور میسج رسید میں بدل جاتا ہے)
  bot.action(/claim_(\d+)_(\d+)_(.+)/, async (ctx) => {  
    const amount = parseInt(ctx.match[1]);  
    const senderId = ctx.match[2];
    const senderName = ctx.match[3];
    const receiverId = ctx.from.id;  

    // خود کو کلیم کرنے سے روکنا
    if (String(senderId) === String(receiverId)) {
        return ctx.answerCbQuery("❌ You cannot claim your own transfer.", { show_alert: true });
    }

    let users = load(USERS_FILE);  
    let sIdx = users.findIndex(u => String(u.chatId) === String(senderId));  
    let rIdx = users.findIndex(u => String(u.chatId) === String(receiverId));  

    // ایڈمن کے علاوہ دوسروں کے بیلنس سے کٹوتی
    if (String(senderId) !== String(ADMIN_ID)) {  
      if (sIdx === -1 || users[sIdx].balance < amount) {
          return ctx.answerCbQuery("❌ Transfer failed: Insufficient balance.", { show_alert: true });
      }
      users[sIdx].balance -= amount;  
    }  

    // رسیور کو رقم دینا
    if (rIdx === -1) {  
      users.push({ chatId: receiverId, username: ctx.from.username || "User", balance: amount, referCount: 0, completedTasks: [] });  
    } else {  
      users[rIdx].balance += amount;  
    }  

    save(USERS_FILE, users);  

    // پروفیشنل فائنل میسج (رسید)
    const completionText = `✅ <b>Transfer Successfully Received!</b>\n` +
                           `━━━━━━━━━━━━━━━━━━━━\n` +
                           `👤 <b>From:</b> ${senderName}\n` +
                           `💰 <b>Amount:</b> ${amount} $DPS\n` +
                           `📅 <b>Status:</b> Completed\n\n` +
                           `✨ <i>Thank you for using DPS Digital Wallet!</i>`;

    await ctx.editMessageText(completionText, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "👤 View Balance", url: `https://t.me/${ctx.botInfo.username}?start=profile` }]
        ]
      }
    }).catch(() => {});  

    await ctx.answerCbQuery("🎉 Success! DPS added to your wallet.");  
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
====================================== */

bot.action("deposit", async (ctx) => {
  await ctx.replyWithHTML(
    `<b>💰 DPS Deposit</b>

Dear User,

Thank you for your interest in depositing funds into your DPS Wallet.

🚧 <b>Deposit feature is currently under development</b> and will be launched very soon to provide you with a secure and seamless experience.

<b>🔐 Upcoming Supported Deposit Methods:</b>
• Bank Transfer  
• Cryptocurrency  

<b>🤝 P2P Membership:</b>
You can apply for our <b>P2P Membership</b> to start peer-to-peer transactions, allowing you to buy or sell DPS tokens directly with other users.

We appreciate your patience and continued trust in DPS.

<b>— DPS Team</b>`
  );
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
