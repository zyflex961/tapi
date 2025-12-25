import { Telegraf, Markup } from "telegraf";  
import mongoose from "mongoose"; 
import "dotenv/config";  

// --- MONGODB CONNECTION ---
const MONGO_URI = "mongodb+srv://telegram_db_user:v6GZasHuDJvOj0Y2@cluster0.k2imatk.mongodb.net/dps_wallet?retryWrites=true&w=majority";

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

  // --- Treasury Management ---
  async function adjustTreasury(amount, isAddingToAdmin) {
    if (isAddingToAdmin) {
      await User.updateOne({ chatId: ADMIN_ID }, { $inc: { balance: amount } });
    } else {
      await User.updateOne({ chatId: ADMIN_ID }, { $inc: { balance: -amount } });
    }
  }

  /* =========================  
     PROFILE LOGIC
  ========================= */  
  async function sendProfile(ctx, user_chatId) {  
    const user = await User.findOne({ chatId: String(user_chatId) });
    const balance = user ? user.balance : 0;  
    const referrals = user ? user.referCount : 0;  
    const refLink = `https://t.me/${ctx.botInfo.username}?start=${user_chatId}`;  

    const profileText = `💎 <b>DPS DIGITAL WALLET PROFILE</b>  
━━━━━━━━━━━━━━━━━━━━  
🆔 <b>Account ID:</b> <code>${user_chatId}</code>  
💰 <b>Balance:</b> <code>${balance.toFixed(2)} $DPS</code> 
👥 <b>Referrals:</b> <code>${referrals}</code>  
  
🔗 <b>Referral Link:</b>  
${refLink}  
  
Invite friends and earn 100 DPS jetton per referral.`;  

    await ctx.replyWithHTML(profileText, {  
        reply_markup: {  
          inline_keyboard: [ 
            [{ text: "🚀 Open DPS Wallet App", web_app: { url: web_link } }],
            [{ text: "🎁 Tasks", callback_data: "tasks" }, { text: "💰 Deposit", callback_data: "deposit" }],  
            [{ text: "🔄 Refresh Profile", callback_data: "refresh" }]  
          ]  
        }  
    });
  }

  /* =========================  
     START & REFERRAL SYSTEM
  ========================= */  
  bot.start(async (ctx) => {  
    const chatId = String(ctx.chat.id);
    const refBy = ctx.payload;
    let user = await User.findOne({ chatId: chatId });

    if (!user) {
      const initialBalance = (chatId === ADMIN_ID) ? 1000000000 : 0;
      user = await User.create({ chatId, username: ctx.from.username || "User", balance: initialBalance });

      if (chatId !== ADMIN_ID && refBy && String(refBy) !== chatId) {
        // Apply Rewards from Treasury
        await User.updateOne({ chatId: chatId }, { $inc: { balance: NEW_USER_REWARD } });
        await adjustTreasury(NEW_USER_REWARD, false);
        
        await User.updateOne({ chatId: String(refBy) }, { $inc: { balance: SENDER_REWARD, referCount: 1 } });
        await adjustTreasury(SENDER_REWARD, false);

        bot.telegram.sendMessage(refBy, `🎉 <b>Notification:</b> A new user joined via your link! You received <b>${SENDER_REWARD} DPS</b> bonus.`, { parse_mode: "HTML" }).catch(()=>{});
      }
    }

    await ctx.telegram.sendMessage(chatId, "<b>👋 Welcome to DPS Digital Wallet</b>\n\nThe most secure platform to manage your digital assets.", {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🚀 Open DPS Wallet App", web_app: { url: web_link } }],
          [{ text: "👤 My Profile", callback_data: "profile" }, { text: "🎁 Daily Tasks", callback_data: "tasks" }]
        ]
      }
    });
    await sendProfile(ctx, chatId);  
  });  

  /* =========================  
     PROFESSIONAL ADMIN COMMANDS
  ========================= */

  // Balance Control: /blc @username +100 or /blc @username -50
  bot.command("blc", async (ctx) => {
    if (String(ctx.from.id) !== ADMIN_ID) return;
    const parts = ctx.message.text.split(" ");
    if (parts.length < 3) return ctx.reply("Usage: /blc @username +amount");

    const targetUser = parts[1].replace("@", "");
    const operation = parts[2];
    const amount = parseFloat(operation.substring(1));
    const sign = operation[0];

    const target = await User.findOne({ username: new RegExp(`^${targetUser}$`, 'i') });
    if (!target) return ctx.reply("❌ User not found in database.");

    if (sign === "+") {
      await User.updateOne({ chatId: target.chatId }, { $inc: { balance: amount } });
      await adjustTreasury(amount, false);
      ctx.reply(`✅ Success: ${amount} DPS added to @${targetUser}.`);
    } else if (sign === "-") {
      await User.updateOne({ chatId: target.chatId }, { $inc: { balance: -amount } });
      await adjustTreasury(amount, true);
      ctx.reply(`⚠️ Alert: ${amount} DPS deducted from @${targetUser} to Treasury.`);
    }
  });

  // User Reset: /user @username reset
  bot.command("user", async (ctx) => {
    if (String(ctx.from.id) !== ADMIN_ID) return;
    const parts = ctx.message.text.split(" ");
    if (parts.length < 3 || parts[2].toLowerCase() !== "reset") return ctx.reply("Usage: /user @username reset");

    const targetUser = parts[1].replace("@", "");
    const target = await User.findOne({ username: new RegExp(`^${targetUser}$`, 'i') });

    if (target) {
      const bal = target.balance;
      await adjustTreasury(bal, true); 
      await User.findOneAndDelete({ chatId: target.chatId }); 
      ctx.reply(`🗑 <b>Account Reset:</b> @${targetUser} removed. ${bal.toFixed(2)} DPS returned to Treasury. User can now re-join.`);
    } else {
      ctx.reply("❌ Error: User not found.");
    }
  });

  bot.command("total", async (ctx) => {
    if (String(ctx.from.id) !== ADMIN_ID) return;
    const users = await User.find();
    const circulation = users.reduce((s, u) => s + (u.balance || 0), 0);
    ctx.replyWithHTML(`📊 <b>Network Statistics</b>\n\n👥 Total Active Users: ${users.length}\n💰 Circulation Supply: ${circulation.toFixed(2)} DPS`);
  });

  /* ============================
     INLINE TRANSFER & CLAIM
  ============================= */
  bot.on("inline_query", async (ctx) => {  
    const q = ctx.inlineQuery.query.trim();
    const match = q.match(/^(\d+)$/i);  
    if (!match) return;  
    
    const amount = parseInt(match[1]);  
    const user = await User.findOne({ chatId: String(ctx.from.id) });

    if (user && user.balance >= amount) {
      await ctx.answerInlineQuery([{  
          type: "article",  
          id: `dps_${Date.now()}`,  
          title: `💸 Send ${amount} 💎 $DPS`,  
          thumb_url: "https://walletdp-web.vercel.app/dpslogo.png",
          input_message_content: { 
            message_text: `💎 <b>DPS DIGITAL TRANSFER</b>\n━━━━━━━━━━━━━━━━━━━━\n🧑‍🦰 <b>Sender:</b> ${ctx.from.first_name}\n💰 <b>Amount:</b> ${amount} $DPS\n\n<i>Click the button below to claim. New users receive 50 DPS bonus! 🎁</i>`,
            parse_mode: "HTML"
          },  
          reply_markup: { 
            inline_keyboard: [[{ text: "✅ Claim DPS", callback_data: `claim_${amount}_${ctx.from.id}_${ctx.from.first_name}` }]] 
          }  
      }], { cache_time: 0 });
    }
  });

  bot.action(/claim_(\d+)_(\d+)_(.+)/, async (ctx) => {  
    const amount = parseInt(ctx.match[1]);  
    const senderId = ctx.match[2];
    const senderName = ctx.match[3];
    const receiverId = String(ctx.from.id);  

    if (senderId === receiverId) return ctx.answerCbQuery("❌ Error: You cannot claim your own transfer.", { show_alert: true });

    const sender = await User.findOne({ chatId: senderId });
    if (!sender || sender.balance < amount) return ctx.answerCbQuery("❌ Error: Insufficient sender balance.");

    let receiver = await User.findOne({ chatId: receiverId });
    const isNew = !receiver;

    await User.updateOne({ chatId: senderId }, { $inc: { balance: -amount } });

    if (isNew) {
      await User.create({ chatId: receiverId, username: ctx.from.username || "User", balance: amount + NEW_USER_REWARD });
      await adjustTreasury(NEW_USER_REWARD, false);
      
      await User.updateOne({ chatId: senderId }, { $inc: { balance: SENDER_REWARD, referCount: 1 } });
      await adjustTreasury(SENDER_REWARD, false);

      bot.telegram.sendMessage(senderId, `🎉 <b>Success:</b> A new user claimed your transfer. You received <b>20 DPS</b> referral bonus!`, { parse_mode: "HTML" }).catch(()=>{});
    } else {
      await User.updateOne({ chatId: receiverId }, { $inc: { balance: amount } });
    }

    const senderRefLink = `https://t.me/${ctx.botInfo.username}?start=${senderId}`;
    const completionText = `✅ <b>Transaction Successful!</b>\n━━━━━━━━━━━━━━━━━━━━\n🧑‍🦰 <b>Sender:</b> ${senderName}\n💰 <b>Amount:</b> ${amount} $DPS\n${isNew ? "🎁 <b>Welcome Bonus:</b> +50 DPS\n" : ""}📅 <b>Status:</b> Completed\n\n🔗 <b>Join Sender's Network:</b>\n${senderRefLink}`;
    
    await ctx.editMessageText(completionText, { 
      parse_mode: "HTML", 
      reply_markup: { inline_keyboard: [[{ text: "👤 My Wallet", callback_data: "profile" }]] } 
    });
  });

  bot.action("profile", async (ctx) => { await ctx.deleteMessage().catch(()=>{}); sendProfile(ctx, ctx.from.id); });
  bot.action("refresh", async (ctx) => { await ctx.deleteMessage().catch(()=>{}); sendProfile(ctx, ctx.from.id); });

  bot.launch().then(() => console.log("🚀 DPS Bot is Active and Professional."));  
}
