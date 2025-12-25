import { Telegraf, Markup } from "telegraf";  
import mongoose from "mongoose"; 
import "dotenv/config";  

// --- MONGODB CONNECTION ---
const MONGO_URI = "mongodb+srv://telegram_db_user:YOUR_PASSWORD@cluster0.k2imatk.mongodb.net/dps_wallet?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI).then(() => console.log("✅ MongoDB Connected")).catch(err => console.log("❌ DB Error:", err));

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

  // --- Helper: Bonus Transfer from Admin to User ---
  async function transferFromTreasury(toChatId, amount) {
    const admin = await User.findOne({ chatId: ADMIN_ID });
    if (admin && admin.balance >= amount) {
      await User.updateOne({ chatId: ADMIN_ID }, { $inc: { balance: -amount } });
      await User.updateOne({ chatId: String(toChatId) }, { $inc: { balance: amount } });
      return true;
    }
    return false;
  }

  async function sendProfile(ctx, user_chatId) {  
    const freshUser = await User.findOne({ chatId: String(user_chatId) });
    const balance = freshUser ? freshUser.balance : 0;  
    const referrals = freshUser ? freshUser.referCount : 0;  
    const refLink = `https://t.me/${ctx.botInfo.username}?start=${user_chatId}`;  

    const profileText = `💎 DPS DIGITAL WALLET PROFILE  
━━━━━━━━━━━━━━━━━━━━  
🆔 Account ID: ${user_chatId}  
💰 Balance: ${balance} $DPS 
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

  bot.start(async (ctx) => {  
    const chatId = String(ctx.chat.id);  
    const refBy = ctx.payload;  
    let user = await User.findOne({ chatId: chatId });

    if (!user) {
      let initialBalance = (chatId === ADMIN_ID) ? 1000000000 : 0;
      user = await User.create({ 
        chatId, username: ctx.from.username || "User", 
        balance: initialBalance, referCount: 0, completedTasks: [] 
      });

      if (chatId !== ADMIN_ID && refBy && String(refBy) !== chatId) {
        const success = await transferFromTreasury(refBy, 150);
        if (success) {
          await User.updateOne({ chatId: String(refBy) }, { $inc: { referCount: 1 } });
          bot.telegram.sendMessage(refBy, "🎉 Congratulations 🎉 You earned 150 DPS from a referral!").catch(() => {});
        }
      }
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

  /* ============================
     INLINE TRANSFER (Original Style & Thumbs)
  ============================= */
  bot.on("inline_query", async (ctx) => {  
    const q = ctx.inlineQuery.query.trim();  
    const match = q.match(/^(\d+)$/i);  
    if (!match) return;  

    const amount = parseInt(match[1]);  
    const user = await User.findOne({ chatId: String(ctx.from.id) });
    const hasBalance = user && user.balance >= amount;

    if (hasBalance) {
      await ctx.answerInlineQuery([{  
          type: "article",  
          id: `dps_send_${Date.now()}`,  
          title: `💸 Send ${amount} 💎 $DPS`,  
          description: `✅ Ready to send this amount your payment is secured. New users get +50 bonus offer!`,
          thumb_url: "https://walletdp-web.vercel.app/dpslogo.png",
          input_message_content: { 
            message_text: `💎 <b>DPS DIGITAL TRANSFER</b>\n━━━━━━━━━━━━━━━━━━━━\n🧑‍🦰 <b>Sender:</b> ${ctx.from.first_name || "User"}\n💰 <b>Amount:</b> ${amount} $DPS\n\n<i>Click the button below to claim. for New users get 100 DPS welcome bonus! 🎁</i>`,
            parse_mode: "HTML"
          },  
          reply_markup: { 
            inline_keyboard: [[{ text: "✅ Claim DPS", callback_data: `claim_${amount}_${ctx.from.id}_${ctx.from.first_name || "User"}` }]] 
          }  
      }], { cache_time: 0 });
    } else {
      await ctx.answerInlineQuery([{  
          type: "article",  
          id: `low_${Date.now()}`,  
          title: `⚠️ Insufficient Balance`,  
          description: `You need ${amount} DPS to send this.`,
          thumb_url: "https://cdn-icons-png.flaticon.com/512/595/595067.png", 
          input_message_content: { 
            message_text: `⚠️ <b>Transaction Alert</b>\n━━━━━━━━━━━━━━━━━━━━\n❌ <b>Status:</b> Failed\n💰 <b>Reason:</b> Insufficient Balance\n\n<i>You don't have enough DPS. Please complete tasks to earn more.</i>`,
            parse_mode: "HTML"
          },
          reply_markup: { inline_keyboard: [[{ text: "🎁 Earn More DPS", url: `https://t.me/${ctx.botInfo.username}?start=tasks` }]] }
      }], { cache_time: 0 });
    }
  });

  bot.action(/claim_(\d+)_(\d+)_(.+)/, async (ctx) => {  
    const amount = parseInt(ctx.match[1]);  
    const senderId = ctx.match[2];
    const senderName = ctx.match[3];
    const receiverId = String(ctx.from.id);  

    if (senderId === receiverId) return ctx.answerCbQuery("❌ You cannot claim your own transfer.", { show_alert: true });

    let sender = await User.findOne({ chatId: senderId });
    if (!sender || sender.balance < amount) return ctx.answerCbQuery("❌ Transfer failed: Insufficient balance.", { show_alert: true });

    let receiver = await User.findOne({ chatId: receiverId });
    await User.updateOne({ chatId: senderId }, { $inc: { balance: -amount } });

    if (!receiver) {
      await User.create({ chatId: receiverId, username: ctx.from.username || "User", balance: amount, referCount: 0, completedTasks: [] });
      await transferFromTreasury(receiverId, 150);
      await transferFromTreasury(senderId, 150);
      await User.updateOne({ chatId: senderId }, { $inc: { referCount: 1 } });
    } else {
      await User.updateOne({ chatId: receiverId }, { $inc: { balance: amount } });
    }

    const completionText = `✅ <b>💰 Transfer Successfully Received Thanks!</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🧑‍🦰 <b>From:</b> ${senderName}\n💰 <b>Amount:</b> ${amount} $DPS\n${!receiver ? "🎁 <b>Bonus:</b> +50 DPS (New User)\n" : ""}📅 <b>Status:</b> Completed\n\n👍 <i>Thank you for using DPS Digital ton Wallet!</i>`;

    await ctx.editMessageText(completionText, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "🧑‍🦰 View Balance", callback_data: "profile" }]] } });  
  });

  bot.command("total", async (ctx) => {  
    if (String(ctx.from.id) === ADMIN_ID) {
        const users = await User.find();
        ctx.reply(`👥 Total users: ${users.length}`);
    }
  });  

  bot.action("profile", async (ctx) => { await sendProfile(ctx, ctx.from.id); });
  bot.action("refresh", async (ctx) => { try { await ctx.deleteMessage(); } catch(e) {} await sendProfile(ctx, ctx.from.id); });

  bot.launch();  
  console.log("✅ DPS Bot is Live on MongoDB.");  
}
