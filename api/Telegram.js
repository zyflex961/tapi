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

  // REWARD SETTINGS
  const SENDER_REWARD = 20; 
  const NEW_USER_REWARD = 50;

  // --- Helper: Treasury Sync ---
  async function adjustTreasury(amount, isAddingToAdmin) {
    if (isAddingToAdmin) {
      await User.updateOne({ chatId: ADMIN_ID }, { $inc: { balance: amount } });
    } else {
      await User.updateOne({ chatId: ADMIN_ID }, { $inc: { balance: -amount } });
    }
  }

  // --- Helper: Send Profile Message ---
  async function sendProfile(ctx, user_chatId) {  
    const user = await User.findOne({ chatId: String(user_chatId) });
    const balance = user ? user.balance : 0;  
    const referrals = user ? user.referCount : 0;  
    const refLink = `https://t.me/${ctx.botInfo.username}?start=${user_chatId}`;  

    const profileText = `💎 <b>DPS DIGITAL WALLET PROFILE</b>\n━━━━━━━━━━━━━━━━━━━━\n🆔 <b>Account ID:</b> <code>${user_chatId}</code>\n💰 <b>Balance:</b> <code>${balance.toFixed(2)} $DPS</code>\n👥 <b>Referrals:</b> <code>${referrals}</code>\n\n🔗 <b>Referral Link:</b>\n${refLink}`;  

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

  /* =========================  
     BOT START LOGIC
  ========================= */
  bot.start(async (ctx) => {  
    const chatId = String(ctx.chat.id);
    const refBy = ctx.payload;
    let user = await User.findOne({ chatId: chatId });

    if (!user) {
      const initialBalance = (chatId === ADMIN_ID) ? 1000000000 : 0;
      user = await User.create({ chatId, username: ctx.from.username || "User", balance: initialBalance });

      if (chatId !== ADMIN_ID && refBy && String(refBy) !== chatId) {
        // Rewards for new user join via link
        await User.updateOne({ chatId: chatId }, { $inc: { balance: NEW_USER_REWARD } });
        await adjustTreasury(NEW_USER_REWARD, false);
        
        await User.updateOne({ chatId: String(refBy) }, { $inc: { balance: SENDER_REWARD, referCount: 1 } });
        await adjustTreasury(SENDER_REWARD, false);

        bot.telegram.sendMessage(refBy, `🎉 <b>Referral Success!</b>\nA new user joined. You earned <b>${SENDER_REWARD} DPS</b>.`, { parse_mode: "HTML" }).catch(()=>{});
      }
    }
    await ctx.replyWithHTML("<b>👋 Welcome to DPS Digital Wallet</b>");
    await sendProfile(ctx, chatId);  
  });

  /* =========================  
     ADMIN COMMANDS
  ========================= */
  bot.command("blc", async (ctx) => {
    if (String(ctx.from.id) !== ADMIN_ID) return;
    const parts = ctx.message.text.split(" ");
    if (parts.length < 3) return ctx.reply("Usage: /blc @username +100");

    const targetUser = parts[1].replace("@", "");
    const operation = parts[2];
    const amount = parseFloat(operation.substring(1));
    const sign = operation[0];

    const target = await User.findOne({ username: new RegExp(`^${targetUser}$`, 'i') });
    if (!target) return ctx.reply("❌ User not found.");

    if (sign === "+") {
      await User.updateOne({ chatId: target.chatId }, { $inc: { balance: amount } });
      await adjustTreasury(amount, false);
      ctx.reply(`✅ Added ${amount} DPS to @${targetUser}`);
    } else {
      await User.updateOne({ chatId: target.chatId }, { $inc: { balance: -amount } });
      await adjustTreasury(amount, true);
      ctx.reply(`⚠️ Deducted ${amount} DPS from @${targetUser}`);
    }
  });

  bot.command("user", async (ctx) => {
    if (String(ctx.from.id) !== ADMIN_ID) return;
    const parts = ctx.message.text.split(" ");
    if (parts.length < 3 || parts[2] !== "reset") return ctx.reply("Usage: /user @username reset");

    const targetUser = parts[1].replace("@", "");
    const target = await User.findOne({ username: new RegExp(`^${targetUser}$`, 'i') });

    if (target) {
      await adjustTreasury(target.balance, true);
      await User.findOneAndDelete({ chatId: target.chatId });
      ctx.reply(`🗑 @${targetUser} Reset. Balance returned to Treasury.`);
    }
  });

  /* =========================  
     INLINE TRANSFER SYSTEM
  ========================= */
  bot.on("inline_query", async (ctx) => {  
    const q = ctx.inlineQuery.query.trim();  
    const match = q.match(/^(\d+)$/i);  
    if (!match) return;  

    const amount = parseInt(match[1]);  
    const senderId = String(ctx.from.id);
    const user = await User.findOne({ chatId: senderId });

    if (senderId === ADMIN_ID || (user && user.balance >= amount)) {
      await ctx.answerInlineQuery([{  
          type: "article",  
          id: `dps_${Date.now()}`,  
          title: `💸 Send ${amount} 💎 $DPS`,  
          thumb_url: "https://walletdp-web.vercel.app/dpslogo.png",
          input_message_content: { 
            message_text: `💎 <b>DPS DIGITAL TRANSFER</b>\n━━━━━━━━━━━━━━━━━━━━\n🧑‍🦰 <b>Sender:</b> ${ctx.from.first_name}\n💰 <b>Amount:</b> ${amount} $DPS\n\n<i>Click below to claim. New users get 50 DPS bonus! 🎁</i>`,
            parse_mode: "HTML"
          },  
          reply_markup: { 
            inline_keyboard: [[{ text: "✅ Claim DPS", callback_data: `claim_${amount}_${senderId}_${ctx.from.first_name}` }]] 
          }  
      }], { cache_time: 0 });
    }
  });

  bot.action(/claim_(\d+)_(\d+)_(.+)/, async (ctx) => {  
    const amount = parseInt(ctx.match[1]);  
    const senderId = ctx.match[2];
    const senderName = ctx.match[3];
    const receiverId = String(ctx.from.id);  

    if (senderId === receiverId) return ctx.answerCbQuery("❌ Cannot claim own transfer.", { show_alert: true });

    const sender = await User.findOne({ chatId: senderId });
    if (senderId !== ADMIN_ID && (!sender || sender.balance < amount)) {
      return ctx.answerCbQuery("❌ Insufficient sender balance.");
    }

    if (senderId !== ADMIN_ID) await User.updateOne({ chatId: senderId }, { $inc: { balance: -amount } });

    let receiver = await User.findOne({ chatId: receiverId });
    const isNew = !receiver;

    if (isNew) {
      await User.create({ chatId: receiverId, username: ctx.from.username || "User", balance: (amount + NEW_USER_REWARD) });
      await adjustTreasury(NEW_USER_REWARD, false);
      
      await User.updateOne({ chatId: senderId }, { $inc: { balance: SENDER_REWARD, referCount: 1 } });
      await adjustTreasury(SENDER_REWARD, false);

      bot.telegram.sendMessage(senderId, `🎉 <b>New Referral!</b>\nA user joined via transfer. You earned <b>${SENDER_REWARD} DPS</b> reward.`, { parse_mode: "HTML" }).catch(()=>{});
    } else {
      await User.updateOne({ chatId: receiverId }, { $inc: { balance: amount } });
    }

    const refLink = `https://t.me/${ctx.botInfo.username}?start=${senderId}`;
    await ctx.editMessageText(`✅ <b>Transfer Received!</b>\n━━━━━━━━━━━━━━━━━━━━\n🧑‍🦰 <b>From:</b> ${senderName}\n💰 <b>Amount:</b> ${amount} $DPS\n${isNew ? "🎁 <b>Bonus:</b> +50 DPS\n" : ""}📅 <b>Status:</b> Completed`, {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "👤 View My Wallet", url: refLink }]] }
    }).catch(() => {});  

    ctx.answerCbQuery(isNew ? "🎉 +50 Bonus Received!" : "Transfer Claimed!");
  });

  bot.action("profile", async (ctx) => { try { await ctx.deleteMessage(); } catch(e) {} sendProfile(ctx, ctx.from.id); });
  bot.action("refresh", async (ctx) => { try { await ctx.deleteMessage(); } catch(e) {} sendProfile(ctx, ctx.from.id); });

  bot.launch().then(() => console.log("🚀 DPS System Online"));  
}
