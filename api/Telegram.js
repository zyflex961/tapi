import { Telegraf, Markup } from "telegraf";  
import mongoose from "mongoose"; 
import "dotenv/config";  

// --- MONGODB CONNECTION ---
// یہاں آپ نے پاس ورڈ سیٹ کر دیا ہے، یہ ٹھیک ہے۔
const MONGO_URI = "mongodb+srv://telegram_db_user:v6GZasHuDJvOj0Y2@cluster0.k2imatk.mongodb.net/dps_wallet?retryWrites=true&w=majority";

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

  // --- Helper: Treasury Transfer Logic (Fixed Supply Management) ---
  async function transferFromTreasury(toChatId, amount) {
    const admin = await User.findOne({ chatId: ADMIN_ID });
    if (admin && admin.balance >= amount) {
      await User.updateOne({ chatId: ADMIN_ID }, { $inc: { balance: -amount } });
      await User.updateOne({ chatId: String(toChatId) }, { $inc: { balance: amount } });
      return true;
    }
    return false;
  }

  /* =========================  
     PROFILE & START
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

  bot.start(async (ctx) => {  
    const chatId = String(ctx.chat.id);  
    const refBy = ctx.payload;  
    let user = await User.findOne({ chatId: chatId });

    if (!user) {
      // اگر ایڈمن ہے تو 1 ارب سپلائی، ورنہ زیرو بیلنس
      let initialBalance = (chatId === ADMIN_ID) ? 1000000000 : 0;
      user = await User.create({ 
        chatId, username: ctx.from.username || "User", 
        balance: initialBalance, referCount: 0, completedTasks: [] 
      });

      // ریفرل بونس لاجک (ایڈمن اکاؤنٹ سے کٹوتی)
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
     INLINE TRANSFER (Original UI & Treasury Logic)
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
          id: `dps_${Date.now()}`,  
          title: `💸 Send ${amount} 💎 $DPS`,  
          description: `✅ Ready to send. New users get bonus!`,
          thumb_url: "https://walletdp-web.vercel.app/dpslogo.png",
          input_message_content: { 
            message_text: `💎 <b>DPS DIGITAL TRANSFER</b>\n━━━━━━━━━━━━━━━━━━━━\n🧑‍🦰 <b>Sender:</b> ${ctx.from.first_name || "User"}\n💰 <b>Amount:</b> ${amount} $DPS\n\n<i>Click the button below to claim. for New users get 100 DPS welcome bonus! 🎁</i>`,
            parse_mode: "HTML"
          },  
          reply_markup: { 
            inline_keyboard: [[{ text: "✅ Claim DPS", callback_data: `claim_${amount}_${ctx.from.id}_${ctx.from.first_name || "User"}` }]] 
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

    let sender = await User.findOne({ chatId: senderId });
    if (!sender || sender.balance < amount) return ctx.answerCbQuery("❌ Insufficient balance.");

    let receiver = await User.findOne({ chatId: receiverId });
    await User.updateOne({ chatId: senderId }, { $inc: { balance: -amount } });

    if (!receiver) {
      // نیا یوزر رسیور (بونس ایڈمن سے کٹے گا)
      await User.create({ chatId: receiverId, username: ctx.from.username || "User", balance: amount, referCount: 0, completedTasks: [] });
      await transferFromTreasury(receiverId, 150); // Welcome bonus from admin
      await transferFromTreasury(senderId, 150);   // Referral bonus from admin
      await User.updateOne({ chatId: senderId }, { $inc: { referCount: 1 } });
    } else {
      await User.updateOne({ chatId: receiverId }, { $inc: { balance: amount } });
    }

    const completionText = `✅ <b>💰 Transfer Successfully Received Thanks!</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🧑‍🦰 <b>From:</b> ${senderName}\n💰 <b>Amount:</b> ${amount} $DPS\n📅 <b>Status:</b> Completed`;
    await ctx.editMessageText(completionText, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "🧑‍🦰 View Balance", callback_data: "profile" }]] } });  
  });

  /* ========================================================
     ADMIN PANEL & SYSTEM COMMANDS
  =========================================================== */
  bot.command("cmd", (ctx) => {
    if (String(ctx.from.id) !== ADMIN_ID) return;
    ctx.replyWithHTML(`🛠 <b>ADMIN PANEL</b>\n\n/total - System Stats\n/leaderboard - Top Referrers\n/give @user amount\n/take @user amount`);
  });

  bot.command("total", async (ctx) => {  
    if (String(ctx.from.id) !== ADMIN_ID) return;
    const users = await User.find();
    const circulation = users.reduce((s, u) => s + (u.balance || 0), 0);
    ctx.replyWithHTML(`👥 Total Users: ${users.length}\n💰 Circulation: ${circulation.toFixed(2)} / 1,000,000,000`);
  });

  bot.command("give", async (ctx) => {
    if (String(ctx.from.id) !== ADMIN_ID) return;
    const parts = ctx.message.text.split(" ");
    const username = parts[1]?.replace("@", "");
    const amt = parseFloat(parts[2]);
    const target = await User.findOne({ username: new RegExp(`^${username}$`, 'i') });
    if (target) {
      const ok = await transferFromTreasury(target.chatId, amt);
      if (ok) ctx.reply(`✅ Successfully gave ${amt} DPS to @${username} from Treasury.`);
    }
  });

  bot.command("take", async (ctx) => {
    if (String(ctx.from.id) !== ADMIN_ID) return;
    const parts = ctx.message.text.split(" ");
    const username = parts[1]?.replace("@", "");
    const amt = parseFloat(parts[2]);
    const target = await User.findOne({ username: new RegExp(`^${username}$`, 'i') });
    if (target && target.balance >= amt) {
      await User.updateOne({ chatId: target.chatId }, { $inc: { balance: -amt } });
      await User.updateOne({ chatId: ADMIN_ID }, { $inc: { balance: amt } }); // واپس ایڈمن والٹ میں
      ctx.reply(`⚠️ Taken ${amt} DPS from @${username} back to Treasury.`);
    }
  });

  bot.command("leaderboard", async (ctx) => {
    const top = await User.find().sort({ referCount: -1 }).limit(10);
    let txt = "🏆 <b>TOP REFERRERS</b>\n\n";
    top.forEach((u, i) => txt += `${i+1}. @${u.username || "User"} - ${u.referCount}\n`);
    ctx.replyWithHTML(txt);
  });

  bot.action("deposit", (ctx) => {
    ctx.replyWithHTML(`<b>💰 DPS Deposit</b>\n\n🚧 Feature under development...`);
  });

  bot.action("profile", async (ctx) => { await sendProfile(ctx, ctx.from.id); });
  bot.action("refresh", async (ctx) => { try { await ctx.deleteMessage(); } catch(e) {} await sendProfile(ctx, ctx.from.id); });

  bot.launch();  
  console.log("✅ DPS Bot System is Online");  
}
