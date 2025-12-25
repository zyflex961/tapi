import { Telegraf, Markup } from "telegraf";  
import mongoose from "mongoose"; 
import "dotenv/config";  

// --- MONGODB CONNECTION ---
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://telegram_db_user:v6GZasHuDJvOj0Y2@cluster0.k2imatk.mongodb.net/dps_wallet?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log("❌ DB Error:", err));

// --- DATA SCHEMA ---
const userSchema = new mongoose.Schema({
  chatId: { type: String, unique: true },
  username: String,
  balance: { type: Number, default: 0 },
  referCount: { type: Number, default: 0 },
  completedTasks: [String]
});
const User = mongoose.model('User', userSchema);

export default function initEuroBot() {  
  const BOT_TOKEN = process.env.BOT_TOKEN;  
  if (!BOT_TOKEN) return;  

  const bot = new Telegraf(BOT_TOKEN);
  const ADMIN_ID = "8230113306"; 
  const web_link = "https://walletdps.vercel.app/";

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

    const profileText = `💎 <b>DPS DIGITAL WALLET PROFILE</b>\n━━━━━━━━━━━━━━━━━━━━\n🆔 <b>Account ID:</b> <code>${user_chatId}</code>\n💰 <b>Balance:</b> <code>${balance.toFixed(2)} $DPS</code>\n👥 <b>Referrals:</b> <code>${referrals}</code>\n\n🔗 <b>Referral Link:</b>\n${refLink}\n\nInvite friends and earn 100 DPS jetton per referral.`;  

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
          bot.telegram.sendMessage(refBy, `🎉 <b>Referral Success!</b>\nA new user joined via your link.\nYou earned <b>${SENDER_REWARD} DPS</b> bonus.`, { parse_mode: "HTML" }).catch(()=>{});
        }
      }
    }
    
    await ctx.replyWithHTML("<b>👋 Welcome to DPS Digital Wallet</b>");
    await sendProfile(ctx, chatId);  
  });

  /* =============================================================
     🛠 ADMIN TOOLS (ALL REQUESTED COMMANDS)
  ============================================================= */
  bot.command("cmd", async (ctx) => {
    if (String(ctx.from.id) !== ADMIN_ID) return;
    const adminMenu = `🛠 <b>ADMIN CONTROL PANEL</b>\n━━━━━━━━━━━━━━━━━━━━━━\n📊 /total - System stats\n🏆 /leaderboard - Top users\n🔍 /finduser @user - Profile lookup\n🎁 /give @user amount - Update balance\n📢 /broadcast - Message all\n👤 /Delete @user - Remove user\n✨ /clear_database_confirm - Wipe all\n\n@zyflex control`;
    await ctx.replyWithHTML(adminMenu);
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
      ctx.replyWithHTML(`🔍 <b>USER INFO:</b>\n🆔 ID: <code>${target.chatId}</code>\n🧑‍🦰 Name: ${sName}\n💰 Balance: ${target.balance}\n👥 Refs: ${target.referCount}`);
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
          title: `💸 Send ${amount} 💎 DPS`,
     description: `✅ Ready to send this amount for new users get +50 bonus offer!`,  
          thumb_url: "https://walletdp-web.vercel.app/dpslogo.png",
          input_message_content: { 
            message_text: `💎 <b> DIGITAL TON PAYMENT TRANSFER</b>\n━━━━━━━━━━━━━━━━━━━━\n🧑‍🦰 <b>Sender:</b> ${ctx.from.first_name}\n💰 <b>Amount:</b> ${amount} $DPS\n\n<i>Click below to claim. New users get 50 DPS bonus! 🎁</i>`,
            parse_mode: "HTML"
          },  
          reply_markup: { inline_keyboard: [[{ text: "✅ Claim Now", callback_data: `claim_${amount}_${ctx.from.id}_${ctx.from.first_name}` }]] }  
      }], { cache_time: 0 });
    }
  });

  bot.action(/claim_(\d+)_(\d+)_(.+)/, async (ctx) => {  
    const [_, amt, sId, sName] = ctx.match;
    const amount = parseInt(amt);
    const receiverId = String(ctx.from.id);
    if (sId === receiverId) return ctx.answerCbQuery(" ❌ Cannot claim own transfer.", { show_alert: true });

    const sender = await User.findOne({ chatId: sId });
    if (sId !== ADMIN_ID && (!sender || sender.balance < amount)) return ctx.answerCbQuery("❌ Insufficient balance 👉 💸.");

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

  bot.launch().then(() => console.log("🚀 DPS System Online"));  
}
