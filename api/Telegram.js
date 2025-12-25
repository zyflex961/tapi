import { Telegraf, Markup } from "telegraf";  
import mongoose from "mongoose"; 
import "dotenv/config";  

// --- MONGODB CONNECTION ---
const MONGO_URI = "mongodb+srv://telegram_db_user:YOUR_PASSWORD@cluster0.k2imatk.mongodb.net/dps_wallet?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI).then(() => console.log("✅ MongoDB Connected")).catch(err => console.log("❌ DB Error:", err));

// --- DATA SCHEMAS ---
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
  if (!BOT_TOKEN) return console.log("❌ BOT_TOKEN missing");  

  const bot = new Telegraf(BOT_TOKEN);  
  const ADMIN_ID = "8230113306"; // Admin ID as String for comparison
  const web_link = "https://walletdps.vercel.app/";

  /* =========================  
     PROFILE MESSAGE 
  ========================= */  
  async function sendProfile(ctx, user_chatId) {  
    const freshUser = await User.findOne({ chatId: String(user_chatId) });
    const balance = freshUser ? freshUser.balance : 0;  
    const referrals = freshUser ? freshUser.referCount : 0;  
    const refLink = `https://t.me/${ctx.botInfo.username}?start=${user_chatId}`;  

    const profileText = `💎 DPS DIGITAL WALLET PROFILE  
━━━━━━━━━━━━━━━━━━━━  
🆔 Account ID: ${user_chatId}  
💰 Balance: ${balance.toFixed(4)} $DPS 
👥 Referrals: ${referrals}  
  
🔗 Referral Link:  
${refLink}  
  
Invite friends and earn 100 DPS jetton per referral.`;  

    await ctx.reply(profileText, {  
        reply_markup: {  
          inline_keyboard: [ 
            [{ text: "🚀 Open DPS Wallet App", web_app: { url: web_link } }],
            [{ text: "🎁 Tasks", callback_data: "tasks" }, { text: "💰 Deposit", callback_data: "deposit" }],  
            [{ text: "🔄 Refresh", callback_data: "refresh" }]  
          ]  
        }  
    });  
  }  

  /* =========================  
     /START + REFERRAL 
  ========================= */  
  bot.start(async (ctx) => {  
    const chatId = String(ctx.chat.id);  
    const refBy = ctx.payload;  
    let user = await User.findOne({ chatId: chatId });

    if (!user) {  
      let initialBalance = 0;

      // اگر نیا یوزر ایڈمن ہے، تو اسے 1 بلین سپلائی دیں
      if (chatId === ADMIN_ID) {
        initialBalance = 1000000000; 
      } else if (refBy && String(refBy) !== chatId) {
        // ریفرل بونس لاجک
        const inviter = await User.findOne({ chatId: String(refBy) });  
        if (inviter) {  
          await User.updateOne({ chatId: String(refBy) }, { $inc: { balance: 150, referCount: 1 } });
          initialBalance = 150;  
          bot.telegram.sendMessage(refBy, "🎉 Congratulations 🎉 You earned 150 DPS from a referral!").catch(() => {});  
        }  
      }

      user = await User.create({ 
        chatId, 
        username: ctx.from.username || "User", 
        balance: initialBalance, 
        referCount: 0, 
        completedTasks: [] 
      });  
    }

    await ctx.telegram.sendMessage(chatId, "<b>👋 Welcome to DPS Digital Wallet</b>\n\nSecure platform to send, receive, swap and stake digital assets.", {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🚀 Open DPS Wallet App", web_app: { url: web_link } }],
          [{ text: "👤 My Profile", callback_data: "profile" }, { text: "🎁 Tasks", callback_data: "tasks" }],
          [{ text: "💰 Deposit", callback_data: "deposit" }]
        ]
      }
    });

    await sendProfile(ctx, chatId);  
  });  

  bot.action("profile", async (ctx) => { await sendProfile(ctx, ctx.from.id); });  
  bot.action("refresh", async (ctx) => {  
    try { await ctx.deleteMessage(); } catch(e) {}  
    await sendProfile(ctx, ctx.from.id);  
  });  

  /* ============================
     INLINE TRANSFER SYSTEM
  ============================= */
  bot.on("inline_query", async (ctx) => {  
    const q = ctx.inlineQuery.query.trim();  
    const match = q.match(/^(\d+)$/i);  
    if (!match) return;  

    const amount = parseInt(match[1]);  
    const user = await User.findOne({ chatId: String(ctx.from.id) });
    
    // اب ایڈمن کا بیلنس بھی چیک ہوگا
    if (user && user.balance >= amount) {
      await ctx.answerInlineQuery([{  
          type: "article",  
          id: `dps_${Date.now()}`,  
          title: `💸 Send ${amount} 💎 $DPS`,  
          thumb_url: "https://walletdp-web.vercel.app/dpslogo.png",
          input_message_content: { 
            message_text: `💎 <b>DPS DIGITAL TRANSFER</b>\n━━━━━━━━━━━━━━━━━━━━\n🧑‍🦰 <b>Sender:</b> ${ctx.from.first_name}\n💰 <b>Amount:</b> ${amount} $DPS\n\n<i>Click below to claim. New users get bonus! 🎁</i>`,
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

    if (senderId === receiverId) return ctx.answerCbQuery("❌ Cannot claim your own transfer.", { show_alert: true });

    let sender = await User.findOne({ chatId: senderId });
    if (!sender || sender.balance < amount) return ctx.answerCbQuery("❌ Insufficient balance.");

    let receiver = await User.findOne({ chatId: receiverId });

    // ٹرانزیکشن پروسیس
    await User.updateOne({ chatId: senderId }, { $inc: { balance: -amount } });

    if (!receiver) {
      // نیا یوزر رسیور
      await User.create({ chatId: receiverId, username: ctx.from.username || "User", balance: amount + 150, referCount: 0 });
      await User.updateOne({ chatId: senderId }, { $inc: { balance: 150, referCount: 1 } });
    } else {
      await User.updateOne({ chatId: receiverId }, { $inc: { balance: amount } });
    }

    await ctx.editMessageText(`✅ <b>💰 Transfer Received!</b>\n━━━━━━━━━━━━━━━━━━━━\n🧑‍🦰 <b>From:</b> ${senderName}\n💰 <b>Amount:</b> ${amount} $DPS`, { parse_mode: "HTML" });
  });

  /* ========================================================
     ADMIN COMMANDS
  =========================================================== */
  bot.command("total", async (ctx) => {  
    if (String(ctx.from.id) !== ADMIN_ID) return;
    const count = await User.countDocuments();
    const users = await User.find();
    const totalBalance = users.reduce((s, u) => s + (u.balance || 0), 0);
    ctx.replyWithHTML(`📊 <b>SYSTEM STATS</b>\n\n👥 Users: ${count}\n💰 System Total: ${totalBalance.toFixed(2)} DPS`);
  });

  bot.command("give", async (ctx) => {
    if (String(ctx.from.id) !== ADMIN_ID) return;
    const parts = ctx.message.text.split(" ");
    const username = parts[1]?.replace("@", "");
    const amt = parseFloat(parts[2]);
    const target = await User.findOneAndUpdate({ username: new RegExp(`^${username}$`, 'i') }, { $inc: { balance: amt } });
    if (target) ctx.reply(`✅ Added ${amt} DPS to @${username}`);
    else ctx.reply("❌ User not found.");
  });

  bot.launch();  
  console.log("✅ Bot Started with MongoDB (Admin supply included)");  
}
