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
  const web_link = "https://walletdps.vercel.app/";


  
  
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
            [{ text: "🚀 Open DPS Wallet App", web_app: { url: web_link } }],
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
        [{ text: "🚀 Open DPS Wallet App", web_app: { url: web_link } }],
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

    /* ==============================
     PRO DPS INLINE TRANSFER SYSTEM (COMPLETE BLOCK)
  =============================== */

 
    /* ========================================================
     PRO DPS INLINE TRANSFER SYSTEM (UPDATED WITH REWARDS & WARNING)
  =========================================================== */

  // 1. ان لائن کوئری (With Balance Warning)
  bot.on("inline_query", async (ctx) => {  
    const q = ctx.inlineQuery.query.trim();  
    const match = q.match(/^(\d+)$/i);  
    if (!match) return;  

    const amount = parseInt(match[1]);  
    const senderName = ctx.from.first_name || "User"; 

    const users = load(USERS_FILE);  
    let sender = users.find(u => String(u.chatId) === String(ctx.from.id));  

    const isAdmin = String(ctx.from.id) === String(ADMIN_ID);
    const hasBalance = sender && sender.balance >= amount;

    if (isAdmin || hasBalance) {
      // ✅ اگر بیلنس کافی ہے تو ٹرانسفر کارڈ دکھائیں
      await ctx.answerInlineQuery([{  
          type: "article",  
          id: `dps_send_${Date.now()}`,  
          title: `💸 Send ${amount} 💎 $DPS`,  
          description: `✅ Ready to send this amount your payment is secured. New users get +50 bonus offer!`,
          thumb_url: "https://walletdp-web.vercel.app/dpslogo.png",
          input_message_content: { 
            message_text: `💎 <b>DPS DIGITAL TRANSFER</b>\n━━━━━━━━━━━━━━━━━━━━\n👤 <b>Sender:</b> ${senderName}\n💰 <b>Amount:</b> ${amount} $DPS\n\n<i>Click the button below to claim. New users get 150 DPS welcome bonus! 🎁</i>`,
            parse_mode: "HTML"
          },  
          reply_markup: { 
            inline_keyboard: [[{ text: "✅ Claim DPS", callback_data: `claim_${amount}_${ctx.from.id}_${senderName}` }]] 
          }  
      }], { cache_time: 0 });
    } else {
      // ❌ اگر بیلنس کم ہے تو وارننگ کارڈ دکھائیں
      await ctx.answerInlineQuery([{  
          type: "article",  
          id: `dps_low_balance_${Date.now()}`,  
          title: `⚠️ Insufficient Balance`,  
          description: `You need ${amount} DPS to send this.`,
          thumb_url: "https://cdn-icons-png.flaticon.com/512/595/595067.png", 
          input_message_content: { 
            message_text: `⚠️ <b>Transaction Alert</b>\n━━━━━━━━━━━━━━━━━━━━\n❌ <b>Status:</b> Failed\n💰 <b>Reason:</b> Insufficient Balance\n\n<i>You don't have enough DPS. Please complete tasks to earn more.</i>`,
            parse_mode: "HTML"
          },
          reply_markup: {
            inline_keyboard: [[{ text: "🎁 Earn More DPS", url: `https://t.me/${ctx.botInfo.username}?start=tasks` }]]
          }
      }], { cache_time: 0 });
    }
  });

  // 2. کلیم ایکشن (New User Reward & Referral Logic)
  bot.action(/claim_(\d+)_(\d+)_(.+)/, async (ctx) => {  
    const amount = parseInt(ctx.match[1]);  
    const senderId = ctx.match[2];
    const senderName = ctx.match[3];
    const receiverId = ctx.from.id;  

    if (String(senderId) === String(receiverId)) {
        return ctx.answerCbQuery("❌ You cannot claim your own transfer.", { show_alert: true });
    }

    let users = load(USERS_FILE);  
    let sIdx = users.findIndex(u => String(u.chatId) === String(senderId));  
    let rIdx = users.findIndex(u => String(u.chatId) === String(receiverId));  

    if (String(senderId) !== String(ADMIN_ID)) {  
      if (sIdx === -1 || users[sIdx].balance < amount) {
          return ctx.answerCbQuery("❌ Transfer failed: Insufficient balance.", { show_alert: true });
      }
      users[sIdx].balance -= amount;  
    }  

    let isNewUser = (rIdx === -1);
    let totalToReceiver = amount;

    if (isNewUser) {
      totalToReceiver += 150; // رسیور کو 150 بونس
      users.push({ 
        chatId: receiverId, 
        username: ctx.from.username || "User", 
        balance: totalToReceiver, 
        referCount: 0, 
        completedTasks: [] 
      });

      if (sIdx !== -1) {
        users[sIdx].balance += 150; // سینڈر کو 150 بونس
        users[sIdx].referCount += 1;
        bot.telegram.sendMessage(senderId, `🎉 congratulations Success! Someone joined via your transfer. You earned 100 DPS bonus!`).catch(() => {});
      }
    } else {
      users[rIdx].balance += amount;
    }

    save(USERS_FILE, users);  

    // سینڈر کا ریفرل لنک تاکہ رسیور اس کا ریفرل بن جائے
    const refLink = `https://t.me/${ctx.botInfo.username}?start=${senderId}`;

    const completionText = `✅ <b>💰 Transfer Successfully Received Thanks!</b>\n` +
                           `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                           `🧑‍🦰 <b>From:</b> ${senderName}\n` +
                           `💰 <b>Amount:</b> ${amount} $DPS\n` +
                           `${isNewUser ? "🎁 <b>Bonus:</b> +50 DPS (New User)\n" : ""}` +
                           `📅 <b>Status:</b> Completed\n\n` +
                           `👍 <i>Thank you for using DPS Digital ton Wallet!</i>`;

    await ctx.editMessageText(completionText, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🧑‍🦰 View Balance", url: refLink }]
        ]
      }
    }).catch(() => {});  

    await ctx.answerCbQuery(isNewUser ? "🎉 Success! +150 Welcome Bonus added!" : "Success! DPS added to wallet.");  
  });



  
  /* ========================================================
     MASTER CONTROL CENTER (ADMIN & USER COMMANDS)
  =========================================================== */

  // 1. Master Command List (Admin Only) - Updated with Clickable Links
  bot.command("cmd", (ctx) => {
    if (String(ctx.from.id) !== String(ADMIN_ID)) return;
    const adminCommands = `
🛠 <b>ADMIN CONTROL PANEL</b>
━━━━━━━━━━━━━━━━━━━━━━━━━
📊 /total - System stats & total balance
🏆 /leaderboard - Top referrers list
🔍 /finduser - Find user data
🎁 /give - Add balance to user
⚠️ /take - Deduct balance from user
📢 /broadcast - Send message to all
📝 /addtask - Create new task

👤 <b>USER COMMANDS</b>
━━━━━━━━━━━━━━━━━━━━
🚀 /start - Main profile menu
📊 /stats - Personal balance & referrals
❓ /help - Guide and support

💡 <i>Tip: Click any command above to use it instantly.</i>`;
    ctx.replyWithHTML(adminCommands);
  });
  

  // 2. System Stats (Total Users & Total Balance)
  bot.command("total", (ctx) => {  
    if (String(ctx.from.id) !== String(ADMIN_ID)) return;
    const users = load(USERS_FILE);
    const totalBalance = users.reduce((sum, u) => sum + (u.balance || 0), 0);
    ctx.replyWithHTML(`📊 <b>DPS SYSTEM STATS</b>\n━━━━━━━━━━━━━━━━━━━━\n👥 Total Users: <b>${users.length}</b>\n💰 Total System Balance: <b>${totalBalance.toFixed(2)} DPS</b>`);
  });

  // 3. Give Balance by Username
  bot.command("give", (ctx) => {
    if (String(ctx.from.id) !== String(ADMIN_ID)) return;
    const parts = ctx.message.text.split(" ");
    if (parts.length < 3) return ctx.reply("Usage: /give @username 100");

    const username = parts[1].replace("@", "").toLowerCase();
    const amount = parseFloat(parts[2]);
    let users = load(USERS_FILE);
    const uIdx = users.findIndex(u => u.username && u.username.toLowerCase() === username);

    if (uIdx !== -1) {
      users[uIdx].balance += amount;
      save(USERS_FILE, users);
      ctx.reply(`✅ Successfully added ${amount} DPS to @${username}`);
      bot.telegram.sendMessage(users[uIdx].chatId, `🎁 Admin has added ${amount} DPS to your wallet!`).catch(() => {});
    } else { ctx.reply("❌ User not found in database."); }
  });

  // 4. Deduct Balance by Username (Take)
  bot.command("take", (ctx) => {
    if (String(ctx.from.id) !== String(ADMIN_ID)) return;
    const parts = ctx.message.text.split(" ");
    if (parts.length < 3) return ctx.reply("Usage: /take @username 100");

    const username = parts[1].replace("@", "").toLowerCase();
    const amount = parseFloat(parts[2]);
    let users = load(USERS_FILE);
    const uIdx = users.findIndex(u => u.username && u.username.toLowerCase() === username);

    if (uIdx !== -1) {
      users[uIdx].balance = Math.max(0, users[uIdx].balance - amount);
      save(USERS_FILE, users);
      ctx.reply(`⚠️ Successfully deducted ${amount} DPS from @${username}`);
      bot.telegram.sendMessage(users[uIdx].chatId, `⚠️ Admin has deducted ${amount} DPS from your balance.`).catch(() => {});
    } else { ctx.reply("❌ User not found."); }
  });

  // 5. Admin Leaderboard (Top Referrals)
  bot.command("leaderboard", (ctx) => {
    if (String(ctx.from.id) !== String(ADMIN_ID)) return;
    const users = load(USERS_FILE);
    const topRefs = users.sort((a, b) => (b.referCount || 0) - (a.referCount || 0)).slice(0, 10);
    let text = "🏆 <b>TOP 10 REFERRERS</b>\n━━━━━━━━━━━━━━━━━━━━\n";
    topRefs.forEach((u, i) => {
      text += `${i + 1}. @${u.username || "User"} — 👥 ${u.referCount || 0} Refers\n`;
    });
    ctx.replyWithHTML(text);
  });

  // 6. Broadcast (Global Message)
  bot.command("broadcast", async (ctx) => {
    if (String(ctx.from.id) !== String(ADMIN_ID)) return;
    const msg = ctx.message.text.split(" ").slice(1).join(" ");
    if (!msg) return ctx.reply("Usage: /broadcast Hello Everyone!");
    const users = load(USERS_FILE);
    ctx.reply(`📢 Sending broadcast to ${users.length} users...`);
    users.forEach(u => {
      bot.telegram.sendMessage(u.chatId, `📢 <b>MESSAGE FROM ADMIN</b>\n\n${msg}`, { parse_mode: "HTML" }).catch(() => {});
    });
  });

  // 7. Find User Details
  bot.command("finduser", (ctx) => {
    if (String(ctx.from.id) !== String(ADMIN_ID)) return;
    const input = ctx.message.text.split(" ")[1];
    if (!input) return ctx.reply("Usage: /finduser @username");
    const username = input.replace("@", "").toLowerCase();
    const users = load(USERS_FILE);
    const user = users.find(u => u.username && u.username.toLowerCase() === username);
    if (user) {
      ctx.replyWithHTML(`👤 <b>USER FOUND</b>\n━━━━━━━━━━━━━━━━━━━━\n🆔 ID: <code>${user.chatId}</code>\n👤 User: @${user.username}\n💰 Balance: ${user.balance} DPS\n👥 Refers: ${user.referCount}`);
    } else { ctx.reply("❌ User not found in database."); }
  });

  /* ========================================================
     PUBLIC USER COMMANDS (English)
  =========================================================== */

  bot.command("help", (ctx) => {
    ctx.replyWithHTML(`<b>❓ How to use DPS Wallet</b>\n\n1️⃣ Use /start to view your profile.\n2️⃣ To send DPS, type <code>@bot_username amount</code> in any chat.\n3️⃣ Complete tasks to earn extra DPS.\n4️⃣ Invite friends using your referral link to earn 150 DPS bonus!`);
  });

  bot.command("stats", (ctx) => {
    const users = load(USERS_FILE);
    const user = users.find(u => String(u.chatId) === String(ctx.from.id));
    if (user) {
      ctx.replyWithHTML(`📊 <b>YOUR STATISTICS</b>\n━━━━━━━━━━━━━━━━━━━━\n💰 Balance: <b>${user.balance} DPS</b>\n👥 Total Referrals: <b>${user.referCount}</b>`);
    }
  });

  bot.command("addtask", (ctx) => {  
    if (String(ctx.from.id) !== String(ADMIN_ID)) return;  
    const parts = ctx.message.text.split("|");  
    if (parts.length < 5) return ctx.reply("Usage: /addtask |ID|Title|Reward|URL");  
    const tasks = load(TASKS_FILE);  
    tasks.push({ id: parts[1].trim(), title: parts[2].trim(), reward: parseInt(parts[3]), url: parts[4].trim() });  
    save(TASKS_FILE, tasks);  
    ctx.reply("✅ Task added successfully.");  
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
