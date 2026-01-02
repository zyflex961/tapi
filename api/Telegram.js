import { Telegraf, Markup } from "telegraf";  
import mongoose from "mongoose"; 
import "dotenv/config";  

// 1. Database URI
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://telegram_db_user:v6GZasHuDJvOj0Y2@cluster0.k2imatk.mongodb.net/dps_wallet?retryWrites=true&w=majority";

// 2. DATA SCHEMA (اسے ہمیشہ کنکشن سے اوپر ہونا چاہیے تاکہ کنکشن اس کو استعمال کر سکے)
const userSchema = new mongoose.Schema({
  chatId: { type: String, unique: true },
  username: String,
  balance: { type: Number, default: 0 },      // DPS Token
  tonBalance: { type: Number, default: 0 },   // TON Coin
  usdtBalance: { type: Number, default: 0 },  // USDT
  referCount: { type: Number, default: 0 },
  completedTasks: [String]
});
const User = mongoose.model('User', userSchema);

// 3. MONGODB CONNECTION & AUTO-UPDATE
mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log("✅ MongoDB Connected");

    try {
      // اب یہاں "User" ٹھیک کام کرے گا
      const result = await User.updateMany(
        { tonBalance: { $exists: false } }, 
        { 
          $set: { 
            tonBalance: 0, 
            usdtBalance: 0 
          } 
        } 
      );

      if (result.modifiedCount > 0) {
        console.log(`✨ Database Updated: ${result.modifiedCount} old users migrated.`);
      } else {
        console.log("ℹ️ Database is already up to date.");
      }
    } catch (err) {
      console.log("❌ Migration Error:", err);
    }
  })
  .catch(err => console.log("❌ DB Error:", err));

// اس کے بعد آپ کا باقی بوٹ لاجک (initEuroBot) شروع ہوگا













// 👇 ad task schema 👇
const taskSchema = new mongoose.Schema({
  title: String,
  reward: Number,
  link: String,
  createdAt: { type: Date, default: Date.now }
});
const Task = mongoose.model('Task', taskSchema);

// --- 👆 end of task schema 

// default bot code👇👇
export default function initEuroBot() {  
  const BOT_TOKEN = process.env.BOT_TOKEN;  
  if (!BOT_TOKEN) return;  

  const bot = new Telegraf(BOT_TOKEN);
  const ADMIN_ID = "8230113306"; 
  const web_link = "https://dpsweb.vercel.app/Tma/";

  const SENDER_REWARD = 20; 
  const NEW_USER_REWARD = 50;

  // --- Treasury Helper ---
  async function adjustTreasury(amount, isAddingToAdmin) {
    await User.updateOne({ chatId: ADMIN_ID }, { $inc: { balance: isAddingToAdmin ? amount : -amount } });
  }

  // --- Profile Function (Same as your original style) ---
  async function sendProfile(ctx, user_chatId) {  
    const user = await User.findOne({ chatId: String(user_chatId) });
    const balance = user ? user.balance : 0;  
    const referrals = user ? user.referCount : 0;  
    const refLink = `https://t.me/${ctx.botInfo.username}?start=${user_chatId}`;  

    const profileText = `🧑‍🦰 <b>DPS DIGITAL WALLET PROFILE </b>\n━━━━━━━━━━━━━━━━━━━━\n🆔 <b>Account ID:</b> <code>${user_chatId}</code>\n💰 <b>Balance:</b> <code>${balance.toFixed(2)} $DPS</code>\n👥 <b>Referrals:</b> <code>${referrals}</code>\n\n🔗 <b>Referral Link:</b>\n${refLink}\n\nInvite friends and earn 100 DPS jetton per referral.`;  

    await ctx.telegram.sendMessage(user_chatId, profileText, {  
        parse_mode: "HTML",
        reply_markup: {  
          inline_keyboard: [ 
            [{ text: "🚀 Open DPS Wallet App", web_app: { url: web_link } }],
            [{ text: "🎁 Tasks", callback_data: "tasks" }, { text: "💰 Deposit", callback_data: "deposit" }],  
            [{ text: "🔄 Refresh Profile", callback_data: "refresh" }]  
          ]  
        }  
    }).catch(() => {});
  }

  /* =============================================================
     🚀 100% ORIGINAL START & REFERRAL LOGIC
  ============================================================= */
  bot.start(async (ctx) => {  
    const chatId = String(ctx.chat.id);
    const refBy = ctx.payload; 
    let user = await User.findOne({ chatId: chatId });

    if (!user) {
      // Create new user record first
      const initialBalance = (chatId === ADMIN_ID) ? 1000000000 : 0;
      await User.create({ 
        chatId, 
        username: ctx.from.username || "User", 
        balance: initialBalance 
      });

      // Pure Referral Logic
      if (chatId !== ADMIN_ID && refBy && String(refBy) !== chatId) {
        const inviter = await User.findOne({ chatId: String(refBy) });
        if (inviter) {
          // Update New User
          await User.updateOne({ chatId: chatId }, { $inc: { balance: NEW_USER_REWARD } });
          await adjustTreasury(NEW_USER_REWARD, false);

          // Update Inviter
          await User.updateOne({ chatId: String(refBy) }, { $inc: { balance: SENDER_REWARD, referCount: 1 } });
          await adjustTreasury(SENDER_REWARD, false);

          // Notify Inviter (Original Notification)
          bot.telegram.sendMessage(refBy, `🎉 <b>Congratulations Referral Success!</b>\nA new user joined via your shared link. Your earned <b>${SENDER_REWARD} DPS</b> bonus.`, { parse_mode: "HTML" }).catch(()=>{});
        }
      }
    }
    
    await ctx.replyWithHTML("<b>👋 Welcome to DPS Digital Wallet</b>");
    await sendProfile(ctx, chatId);  
  });


  /* =====================
// admin command area Here I have defined all the commands.
================================ */

  bot.command("cmd", async (ctx) => {
    try {
        // چیک کریں کہ کیا میسج بھیجنے والا موجود ہے
        if (!ctx.from) return;

        // Admin ID کو چیک کرنے کا محفوظ طریقہ
        if (String(ctx.from.id) !== String(ADMIN_ID)) {
            return; // اگر ایڈمن نہیں ہے تو خاموشی سے ختم کر دیں
        }

        const adminMenu = `
🛠 <b>ADMIN CONTROL PANEL</b>
━━━━━━━━━━━━━━━━━━━━━━
📊 /total - System stats
🏆 /leaderboard - Top users
🔍 /finduser @user - Profile lookup
🎁 /give @user amount - Update balance
📢 /broadcast - Message all
👤 /Delete @user - Remove user
👁️ /viewtasks - list of all task
📴 /deltask - remove task 
✍️ /addtask - add new task
✨ /clear_database_confirm - Wipe all

<i>List of all command & control</i>`;

        await ctx.replyWithHTML(adminMenu);
        
    } catch (error) {
        console.error("Command Error:", error);
    }
});
  

  bot.command("total", async (ctx) => {
    if (String(ctx.from.id) !== ADMIN_ID) return;
    const users = await User.find();
    const total = users.reduce((acc, u) => acc + (u.balance || 0), 0);
    ctx.replyWithHTML(`📊 <b>SYSTEM STATISTICS</b>\n\n👥 Users: ${users.length}\n💰 Supply: ${total.toFixed(2)} DPS`);
  });

  bot.command("leaderboard", async (ctx) => {
    const top = await User.find().sort({ referCount: -1 }).limit(10);
    let msg = `🏆 <b>TOP REFERRERS USER</b>\n━━━━━━━━━━━━━━━━━━\n`;
    top.forEach((u, i) => msg += `${i+1}. @${u.username || 'User'} - ${u.referCount} Refs\n`);
    ctx.replyWithHTML(msg);
  });

  bot.command("finduser", async (ctx) => {
    if (String(ctx.from.id) !== ADMIN_ID) return;
    const username = ctx.message.text.split(" ")[1]?.replace("@", "");
    const target = await User.findOne({ username: new RegExp(`^${username}$`, 'i') });
    if (target) {
      ctx.replyWithHTML(`🔍 <b>USER INFO:</b>\n🆔 ID: <code>${target.chatId}</code>\n💰 Balance: ${target.balance}\n👥 Refs: ${target.referCount}`);
    } else { ctx.reply("❌ User not found."); }
  });

  bot.command("give", async (ctx) => {
    if (String(ctx.from.id) !== ADMIN_ID) return;
    const [_, username, amt] = ctx.message.text.split(" ");
    const amount = parseFloat(amt);
    const target = await User.findOne({ username: new RegExp(`^${username?.replace("@","")}$`, 'i') });
    if (target && !isNaN(amount)) {
      await User.updateOne({ chatId: target.chatId }, { $inc: { balance: amount } });
      await adjustTreasury(Math.abs(amount), amount > 0 ? false : true);
      ctx.reply(`✅ Balance updated for @${username}`);
    }
  });

  bot.command("Delete", async (ctx) => {
    if (String(ctx.from.id) !== ADMIN_ID) return;
    const username = ctx.message.text.split(" ")[1]?.replace("@", "");
    const target = await User.findOneAndDelete({ username: new RegExp(`^${username}$`, 'i') });
    if (target) {
        await adjustTreasury(target.balance, true);
        ctx.reply(`👤 @${username} removed from database.`);
    }
  });

  bot.command("clear_database_confirm", async (ctx) => {
    if (String(ctx.from.id) !== ADMIN_ID) return;
    await User.deleteMany({ chatId: { $ne: ADMIN_ID } });
    ctx.reply("✨ Database Cleared.");
  });

   bot.command("addtask", async (ctx) => {
    if (String(ctx.from.id) !== ADMIN_ID) return;
    const input = ctx.message.text.replace("/addtask", "").trim();
    const parts = input.split("|").map(p => p.trim());
    if (parts.length < 3) return ctx.reply("❌ Usage: /addtask Name | Reward | Link");
    
    try {
      await Task.create({ title: parts[0], reward: parseFloat(parts[1]), link: parts[2] });
      ctx.reply(`✅ Task Added: ${parts[0]}`);
    } catch (e) { ctx.reply("❌ Error: " + e.message); }
  });

    bot.command("deltask", async (ctx) => {
    if (String(ctx.from.id) !== ADMIN_ID) return;
    const taskId = ctx.message.text.split(" ")[1];
    if (!taskId) return ctx.reply("❌ Usage: /deltask [Task_ID]\nGet ID from /viewtasks");

    try {
      const deleted = await Task.findByIdAndDelete(taskId);
      if (deleted) {
        ctx.reply(`✅ Task Removed: ${deleted.title}`);
      } else {
        ctx.reply("❌ Task not found with this ID.");
      }
    } catch (e) { ctx.reply("❌ Invalid ID format."); }
  });
  

    bot.command("viewtasks", async (ctx) => {
    if (String(ctx.from.id) !== ADMIN_ID) return;
    try {
      const allTasks = await Task.find().sort({ createdAt: 1 });
      if (allTasks.length === 0) return ctx.reply("📭 No tasks in database.");

      let msg = "📋 <b>CURRENT ACTIVE MISSIONS:</b>\n━━━━━━━━━━━━━━━━━━━━\n";
      allTasks.forEach((t, i) => {
        msg += `<b>${i + 1}.</b> ${t.title}\n💰 Reward: ${t.reward}\n🔗 Link: ${t.link}\n🆔 ID: <code>${t._id}</code>\n\n`;
      });
      msg += `<i>To remove a task, use: /deltask [ID]</i>`;
      ctx.replyWithHTML(msg);
    } catch (e) { ctx.reply("Error: " + e.message); }
  });
  

    /* =============================================================
     👤 USER INTERFACE: STATS & HELP COMMANDS
  ============================================================= */

  // 1. PROFESSIONAL USER ANALYTICS (STATS)
  bot.command("stats", async (ctx) => {
    try {
      const user = await User.findOne({ chatId: String(ctx.from.id) });
      
      if (user) {
        const statsMsg = `📊 <b>DPS USER ANALYTICS</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `👤 <b>User:</b> @${user.username || 'User'}\n` +
          `🆔 <b>Account ID:</b> <code>${user.chatId}</code>\n\n` +
          `💰 <b>Current Balance:</b>\n ┗━━ <code>${user.balance.toFixed(2)} $DPS</code>\n\n` +
          `👥 <b>Network Growth:</b>\n ┗━━ <code>${user.referCount} Successful Referrals</code>\n\n` +
          `🏆 <b>Rank Status:</b> ${user.referCount > 10 ? "💎 VIP Pro Holder" : "🌟 Growing Member"}\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `<i>Tip: Keep sharing small amounts to invite more people!</i>`;
        
        await ctx.replyWithHTML(statsMsg, Markup.inlineKeyboard([
          [Markup.button.callback("🔄 Refresh Analytics", "refresh")]
        ]));
      } else {
        ctx.reply("❌ Error: Please use /start first to initialize your wallet.");
      }
    } catch (e) {
      console.log("Stats Error:", e);
    }
  });

  // 2. INTERNATIONAL USER GUIDE (HELP)
  bot.command("help", (ctx) => {
    const botUser = ctx.botInfo.username;
    const helpText = `✨ <b>DPS DIGITAL ECOSYSTEM: USER GUIDE</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `👋 <b>Welcome to the Global Hub of $DPS Assets!</b>\n` +
      `DPS is not just a wallet; it’s a gateway to your digital financial growth in a decentralized economy.\n\n` +
      `🚀 <b>STRATEGY: HOW TO EARN FAST?</b>\n` +
      `The most effective way to expand your network is to transfer small amounts (e.g., 5 or 10 DPS) to friends or within public groups.\n\n` +
      `💡 <b>Pro Earning Tip:</b>\n` +
      `When you send 10 DPS via inline mode, anyone who claims it automatically becomes <b>Your Permanent Referral</b>. This converts a tiny transfer into a long-term passive income stream through referral bonuses!\n\n` +
      `📝 <b>QUICK NAVIGATION:</b>\n` +
      `• <b>Profile:</b> Type /start to view balance and your unique referral link.\n` +
      `• <b>Instant Pay:</b> In any chat, type <code>@${botUser} [amount]</code> to transfer funds.\n` +
      `• <b>Bonus Tasks:</b> Click the 🎁 <b>Tasks</b> button in your profile to claim daily rewards.\n\n` +
      `🔐 <b>SECURITY & TRANSPARENCY:</b>\n` +
      `Every transaction is secured and logged within our encrypted database. For dispute resolution or technical assistance, contact our Global Support: @zyflex.\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `<i>Click the button below to close this guide.</i>`;

    ctx.replyWithHTML(helpText, Markup.inlineKeyboard([
      [Markup.button.callback("✅ GOT IT, THANKS", "close_help")]
    ]));
  });

  // 3. ACTION TO CLOSE HELP MESSAGE
  bot.action("close_help", async (ctx) => {
    try {
      await ctx.deleteMessage();
    } catch (e) {
      ctx.answerCbQuery("Closed.");
    }
  });
  

  /* =============================================================
     💰 INLINE TRANSFER & CLAIM (STABLE VERSION)
  ============================================================= */
  bot.on("inline_query", async (ctx) => {  
    const match = ctx.inlineQuery.query.trim().match(/^(\d+)$/i);  
    if (!match) return;  
    const amount = parseInt(match[1]);  
    const sender = await User.findOne({ chatId: String(ctx.from.id) });
    if (String(ctx.from.id) === ADMIN_ID || (sender && sender.balance >= amount)) {
      await ctx.answerInlineQuery([{  
          type: "article", id: `dps_${Date.now()}`, 
          title: `💸 Send ${amount} 💎 DPS..?`,
     description: `✅ Ready to send this amount. If your payment receiver is a new user, you will receive a cashback reward.`,  
          thumb_url: "https://walletdp-web.vercel.app/dpslogo.png",
          input_message_content: { 
            message_text: `💎 <b> DIGITAL TON PAYMENT RECEIVED </b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n🧑‍🦰 <b>Sender:</b> ${ctx.from.first_name}\n💰 <b>Amount:</b> ${amount} $DPS\n\n<i>Click below to claim. New users get 50 DPS bonus! 🎁</i>`,
            parse_mode: "HTML"
          },  
          reply_markup: { inline_keyboard: [[{ text: "✅ Confirm this amount", callback_data: `claim_${amount}_${ctx.from.id}_${ctx.from.first_name}` }]] }  
      }], { cache_time: 0 });
    }
  });

  bot.action(/claim_(\d+)_(\d+)_(.+)/, async (ctx) => {  
    const [_, amt, sId, sName] = ctx.match;
    const amount = parseInt(amt);
    const receiverId = String(ctx.from.id);
    if (sId === receiverId) return ctx.answerCbQuery(" ❌ Cannot claim own transfer.", { show_alert: true });

    const sender = await User.findOne({ chatId: sId });

if (sId !== ADMIN_ID && (!sender || sender.balance < amount)) {
  return ctx.answerCbQuery("❌ Insufficient balance. Please deposit your fund 👉 💸", { show_alert: true });
}




    if (sId !== ADMIN_ID) await User.updateOne({ chatId: sId }, { $inc: { balance: -amount } });

    let receiver = await User.findOne({ chatId: receiverId });
    const isNew = !receiver;

    if (isNew) {
      await User.create({ chatId: receiverId, username: ctx.from.username || "User", balance: (amount + NEW_USER_REWARD) });
      await adjustTreasury(NEW_USER_REWARD, false);
      await User.updateOne({ chatId: sId }, { $inc: { balance: SENDER_REWARD, referCount: 1 } });
      await adjustTreasury(SENDER_REWARD, false);
      bot.telegram.sendMessage(sId, `🎉 <b> Congratulations  New Referral!</b>\nA user joined via transfer. You earned <b>${SENDER_REWARD} DPS</b> bonus Make more transaction you will earn more money.`, { parse_mode: "HTML" }).catch(()=>{});
    } else {
      await User.updateOne({ chatId: receiverId }, { $inc: { balance: amount } });
    }

    await ctx.editMessageText(`<b>💰 Transfer Successfully Received Thanks!</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🧑‍🦰 <b>From:</b> ${sName}\n💰 <b>Amount:</b> ${amount} $DPS\n${isNew ? "🎁 <b>Bonus:</b> +50 DPS\n" : ""}📅 <b>Status:</b> Completed\n\n👍 Thank you for using DPS Digital ton Wallet`, {
      parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "👤 View My Wallet", url: `https://t.me/${ctx.botInfo.username}?start=${sId}` }]] }
    }).catch(() => {});  
    ctx.answerCbQuery(isNew ? "🎉 +50 Bonus Added!" : "Claimed successful check profile!");
  });

  bot.action("refresh", async (ctx) => { try { await ctx.deleteMessage(); } catch(e) {} sendProfile(ctx, ctx.from.id); });
  bot.action("profile", async (ctx) => { try { await ctx.deleteMessage(); } catch(e) {} sendProfile(ctx, ctx.from.id); });


  
    // ------ DEPOSIT ACTION HANDLER START -----
  bot.action("deposit", async (ctx) => {
    const chatId = String(ctx.from.id);
    
    const depositText = 
      `💳 <b>DEPOSIT ASSETS (TON NETWORK)</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `You can deposit <b>TON</b>, <b>USDT</b>, or <b>DPS</b> tokens using the official address below.\n\n` +
      `📌 <b>IMPORTANT INSTRUCTIONS:</b>\n` +
      `• Only send assets via the <b>TON Network</b>.\n` +
      `• You <b>MUST</b> include your Memo/Comment to ensure the system credits your account.\n\n` +
      `🆔 <b> 👇 YOUR MEMO (REQUIRED) :</b>\n` +
      `<code>${chatId}</code>\n\n` +
      `🏦 <b>👇 YOUR WALLET:</b>\n` +
      `<code>UQAJ3_21reITe-puJuEyRotn0PWlLDcbuTKF65JxhvjTBtuI</code>\n\n` +
      `⚠️ <i>Assets sent without the correct Memo may be lost. Deposits are processed after network confirmation.</i>`;

    try {
      // Deleting old message and sending new one for a clean look
      await ctx.deleteMessage().catch(() => {}); 
      
      await ctx.replyWithHTML(depositText, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ I have sent the funds", callback_data: "confirm_deposit" }],
            [{ text: "⬅️ Back to Profile", callback_data: "profile" }]
          ]
        }
      });
    } catch (e) {
      console.log("Deposit Error:", e);
      ctx.answerCbQuery("Error opening deposit menu.");
    }
  });

  // Simple Confirmation Alert
  bot.action("confirm_deposit", (ctx) => {
    ctx.answerCbQuery("Verification in progress. Please wait for network confirmations.", { show_alert: true });
  });
  

  // -----  👆👆👆 end of deposit handler code ------


  
    bot.action("tasks", async (ctx) => {
    const user = await User.findOne({ chatId: String(ctx.from.id) });
    const allTasks = await Task.find().sort({ createdAt: 1 });
    if (allTasks.length === 0) return ctx.answerCbQuery("No tasks available!", { show_alert: true });

    let buttons = [];
    allTasks.forEach((t) => {
      const isDone = user.completedTasks.includes(String(t._id));
      buttons.push([Markup.button.callback(`${isDone ? '✅' : '🎁'} ${t.title} (+${t.reward})`, isDone ? "already_done" : `do_${t._id}`)]);
    });
    buttons.push([Markup.button.callback("⬅️ Back to Profile", "profile")]);

    await ctx.editMessageText("🎁 <b>DPS REWARD MISSIONS</b>\nComplete tasks to earn tokens!", {
      parse_mode: "HTML", reply_markup: { inline_keyboard: buttons }
    }).catch(() => {});
  });

  bot.action(/do_(.+)/, async (ctx) => {
    const task = await Task.findById(ctx.match[1]);
    if (!task) return;
    const btns = [[Markup.button.url("🔗 Open Task Link", task.link)], [Markup.button.callback("✅ Verify Completion", `verify_${task._id}`)]];
    await ctx.editMessageText(`🚀 <b>Task:</b> ${task.title}\n💰 <b>Reward:</b> ${task.reward} DPS`, {
      parse_mode: "HTML", reply_markup: { inline_keyboard: btns }
    });
  });
  

  bot.action(/complete_task_(.+)/, async (ctx) => {
  const taskId = ctx.match[1];
  const userId = ctx.from.id;

  try {
    const task = await Task.findById(taskId);
    if (!task) return ctx.answerCbQuery("Task not found!");

    const user = await User.findOne({ chatId: String(userId) });
    if (!user) return ctx.answerCbQuery("User not found. Please /start again.");

    // 1. Check if already completed
    if (user.completedTasks.includes(taskId)) {
      return ctx.answerCbQuery("❌ You have already completed this task!", { show_alert: true });
    }

    // 2. Verification Logic
    if (task.link.includes("t.me/")) {
      // --- TELEGRAM VERIFICATION ---
      let username = task.link.split("t.me/")[1].split("/")[0];
      if (!username.startsWith("@")) username = "@" + username;

      try {
        const member = await ctx.telegram.getChatMember(username, userId);
        const isJoined = ['member', 'administrator', 'creator'].includes(member.status);

        if (!isJoined) {
          return ctx.answerCbQuery(`⚠️ Please join ${username} first!`, { show_alert: true });
        }
      } catch (err) {
        // If bot is not admin, we skip the hard check to avoid blocking the user
        console.log("Bot needs admin rights in:", username);
      }
    } else {
      // --- EXTERNAL VERIFICATION (YouTube, Twitter, WhatsApp) ---
      await ctx.answerCbQuery("Verifying task... Please wait 5 seconds.", { show_alert: false });
      
      // Simulating a verification delay
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // 3. Reward the User
    await User.updateOne(
      { chatId: String(userId) },
      { 
        $inc: { balance: task.reward }, 
        $push: { completedTasks: taskId } 
      }
    );

    // 4. Success Message in English
    await ctx.editMessageText(
      `✅ <b>Task Completed!</b>\n\n` +
      `You have received <b>${task.reward} DPS</b> tokens.\n\n` +
      `Keep completing tasks to earn more!`,
      { parse_mode: "HTML" }
    );
    
    ctx.answerCbQuery("Success! Reward added.");

  } catch (e) {
    console.error(e);
    ctx.answerCbQuery("Error: Something went wrong.");
  }
});
  

  bot.launch().then(() => console.log("🚀 DPS System Online"));  
}



// --- Updated for Multi-Token Support ---
export const getUserData = async (req, res) => {
    try {
        const user = await User.findOne({ chatId: req.params.chatId });
        if (user) {
            res.json({
                username: user.username,
                referCount: user.referCount,
                // Sending all token balances to the frontend
                balances: {
                    dps: user.balance || 0,
                    ton: user.tonBalance || 0,
                    usdt: user.usdtBalance || 0
                }
            });
        } else {
            res.status(404).json({ error: "User not found" });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

