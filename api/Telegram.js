import { Telegraf, Markup } from 'telegraf';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

// --- کنفیگریشن ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = 8230113306; 
const WEB_APP_URL = 'Https://t.me/DPSwallet_bot?startapp';
const DEFAULT_PHOTO = 'https://i.ibb.co/L8N9m9p/euro-banner.jpg'; 

const bot = new Telegraf(BOT_TOKEN);
const USERS_FILE = path.join(process.cwd(), 'users.json');
const TASKS_FILE = path.join(process.cwd(), 'tasks.json');

// --- ڈیٹا ہینڈلنگ ---
const loadJSON = (file) => {
    if (!fs.existsSync(file)) return [];
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return []; }
};
const saveJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

/* ------------------ 1. پروفائل اور ویلکم لاجک ------------------ */
async function sendProfile(ctx, user) {
    const refLink = `https://t.me/${ctx.botInfo.username}?start=${user.chatId}`;
    const profileMsg = 
        `🇪🇺 *EURO DIGITAL WALLET*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🆔 *Account ID:* \`${user.chatId}\`\n` +
        `💰 *Available Balance:* **€${user.balance}**\n` +
        `👥 *Total Referrals:* ${user.referCount}\n\n` +
        `🔗 *Referral Link (Tap to Copy):*\n\`${refLink}\`\n\n` +
        `🚀 *Earn €200 for every friend you invite!* 💶`;

    await ctx.replyWithPhoto(DEFAULT_PHOTO, {
        caption: profileMsg,
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.url('🚀 Open DPS Wallet App', WEB_APP_URL)],
            [Markup.button.callback('💰 Deposit Euro (P2P/Crypto)', 'buy_euro')],
            [Markup.button.callback('🎁 Daily Tasks', 'view_tasks'), Markup.button.callback('🔄 Refresh', 'refresh_stats')]
        ])
    });
}

bot.start(async (ctx) => {
    const chatId = ctx.chat.id;
    const refBy = ctx.payload;
    let users = loadJSON(USERS_FILE);
    let user = users.find(u => u.chatId === chatId);

    if (!user) {
        let bonus = 0;
        if (refBy && refBy != chatId) {
            const inviterIdx = users.findIndex(u => u.chatId == refBy);
            if (inviterIdx !== -1) {
                users[inviterIdx].balance += 200;
                users[inviterIdx].referCount += 1;
                bonus = 50; 
                bot.telegram.sendMessage(refBy, `🎊 *Referral Alert!*\nSomeone joined via your link. You earned **€200**!`, { parse_mode: 'Markdown' }).catch(() => {});
            }
        }
        user = { chatId, username: ctx.from.username || 'User', balance: bonus, referCount: 0, completedTasks: [], joinedAt: new Date().toISOString() };
        users.push(user);
        saveJSON(USERS_FILE, users);
    }

    const welcomeText = `👋 *Welcome to DPS Euro Wallet!*\n\n` +
        `💶 *Join Bonus:* €50 (Referral only)\n` +
        `👥 *Refer Reward:* €200 per friend\n` +
        `💸 *Inline Transfer:* Send funds in any chat!\n` +
        `🏦 *P2P Deposit:* Local banks & Crypto supported.\n\n` +
        `استعمال کرنے کے لیے نیچے دیے گئے بٹن پر کلک کریں۔`;
    
    await ctx.replyWithMarkdown(welcomeText);
    sendProfile(ctx, user);
});

/* ------------------ 2. ان لائن فنڈ ٹرانسفر (P2P) ------------------ */
bot.on('inline_query', async (ctx) => {
    const amount = parseInt(ctx.inlineQuery.query.trim());
    if (!amount || amount <= 0) return ctx.answerInlineQuery([]);

    const results = [{
        type: 'article',
        id: `send_${Date.now()}`,
        title: `💸 Send €${amount} Euro`,
        description: `Click to generate a claimable link for €${amount}`,
        input_message_content: {
            message_text: `🌟 *EURO DIGITAL TRANSFER*\n\nI am sending you **€${amount}**.\n\n_You can use these funds in your transactions. Contact us to deposit more funds into your account._`,
            parse_mode: 'Markdown'
        },
        ...Markup.inlineKeyboard([[Markup.button.callback('📊 Claim Euro / View Profile', `receive_${amount}_${ctx.from.id}`)]])
    }];
    ctx.answerInlineQuery(results, { cache_time: 0 });
});

bot.action(/receive_(\d+)_(\d+)/, (ctx) => {
    const amount = parseInt(ctx.match[1]);
    const senderId = parseInt(ctx.match[2]);
    let users = loadJSON(USERS_FILE);
    if (ctx.from.id == senderId) return ctx.answerCbQuery("❌ You cannot claim your own funds!");

    const sIdx = users.findIndex(u => u.chatId == senderId);
    if (senderId !== ADMIN_ID && (sIdx === -1 || users[sIdx].balance < amount)) return ctx.answerCbQuery("❌ Insufficient funds or invalid transfer.");

    let rIdx = users.findIndex(u => u.chatId == ctx.from.id);
    if (rIdx === -1) {
        users.push({ chatId: ctx.from.id, username: ctx.from.username, balance: 0, referCount: 0, completedTasks: [] });
        rIdx = users.length - 1;
    }

    if (senderId !== ADMIN_ID) users[sIdx].balance -= amount;
    users[rIdx].balance += amount;
    saveJSON(USERS_FILE, users);

    ctx.editMessageText(`✅ *Transfer Successful!*\n\n${ctx.from.first_name} has claimed **€${amount}**.`);
});

/* ------------------ 3. ٹاسک سسٹم ------------------ */
bot.action('view_tasks', (ctx) => {
    const tasks = loadJSON(TASKS_FILE);
    const user = loadJSON(USERS_FILE).find(u => u.chatId === ctx.from.id);
    if (!tasks.length) return ctx.answerCbQuery("No tasks available.");

    const buttons = tasks.map(t => {
        const done = user.completedTasks.includes(t.id);
        return [
            Markup.button.url(`${t.title} ${done ? '✅' : `(+€${t.reward})`}`, t.url),
            Markup.button.callback(done ? '✓ Verified' : 'Verify ✅', `v_${t.id}`)
        ];
    });
    ctx.editMessageCaption("🎁 *Complete tasks to earn Euro:*", { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
});

bot.action(/v_(.+)/, (ctx) => {
    const tid = ctx.match[1];
    let users = loadJSON(USERS_FILE);
    let uIdx = users.findIndex(x => x.chatId === ctx.from.id);
    const task = loadJSON(TASKS_FILE).find(x => x.id === tid);

    if (users[uIdx].completedTasks.includes(tid)) return ctx.answerCbQuery("Already done!");
    users[uIdx].balance += task.reward;
    users[uIdx].completedTasks.push(tid);
    saveJSON(USERS_FILE, users);
    ctx.reply(`✅ *Success!* You earned **€${task.reward}**.`);
});

/* ------------------ 4. لوکل اور گلوبل ڈیپازٹ ------------------ */
bot.action('buy_euro', (ctx) => {
    const text = `💰 *DEPOSIT FUNDS (P2P / CRYPTO)*\n━━━━━━━━━━━━━━━━━━━━\n` +
        `🇵🇰 **Pakistan:** JazzCash/Bank\n🇮🇳 **India:** UPI/PhonePe\n🇸🇦 **Saudia:** STCPay/Local Bank\n\n` +
        `🌐 **Global:** USDT (TRC20): \`TYuR789...YourAddress\`\n\n` +
        `📝 *How:* Send amount and upload the **Screenshot** here. Admin will approve within 15 mins.`;
    ctx.replyWithMarkdown(text);
});

bot.on(['photo', 'text'], async (ctx, next) => {
    if (ctx.message.text && ctx.message.text.startsWith('/')) return next();
    await ctx.forwardMessage(ADMIN_ID);
    bot.telegram.sendMessage(ADMIN_ID, `📩 *Deposit Request* from \`${ctx.from.id}\``, 
        Markup.inlineKeyboard([[Markup.button.callback('✅ Approve €1000', `app_1000_${ctx.from.id}`)], [Markup.button.callback('❌ Reject', `rej_${ctx.from.id}`)]])
    );
    ctx.reply("⏳ Proof sent to Admin. Verification in progress...");
});

bot.action(/app_(\d+)_(\d+)/, (ctx) => {
    const amount = parseInt(ctx.match[1]);
    const tid = parseInt(ctx.match[2]);
    let users = loadJSON(USERS_FILE);
    let u = users.find(x => x.chatId == tid);
    if (u) {
        u.balance += amount;
        saveJSON(USERS_FILE, users);
        bot.telegram.sendMessage(tid, `🎉 *Deposit Approved!* €${amount} added.`);
        ctx.editMessageText(`✅ Approved €${amount}`);
    }
});

/* ------------------ 5. ایڈمن کمانڈز (Total, Broadcast, AddTask) ------------------ */
bot.command('total', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const users = loadJSON(USERS_FILE);
    ctx.reply(`📊 *Total Registered Users:* ${users.length}`);
});

bot.command('broadcast', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const msg = ctx.message.text.replace('/broadcast', '').trim();
    if (!msg) return ctx.reply("Usage: /broadcast [Your Message]");
    const users = loadJSON(USERS_FILE);
    let count = 0;
    for (const u of users) {
        try { await bot.telegram.sendMessage(u.chatId, `📢 *ANNNOUNCEMENT*\n\n${msg}`, { parse_mode: 'Markdown' }); count++; } catch (e) {}
    }
    ctx.reply(`✅ Broadcast sent to ${count} users.`);
});

bot.command('addtask', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const p = ctx.message.text.split('|');
    if (p.length < 4) return ctx.reply("Usage: /addtask ID | Title | Reward | URL");
    let tasks = loadJSON(TASKS_FILE);
    tasks.push({ id: p[0].replace('/addtask','').trim(), title: p[1].trim(), reward: parseInt(p[2]), url: p[3].trim() });
    saveJSON(TASKS_FILE, tasks);
    ctx.reply("✅ Task Added!");
});

bot.command('profile', (ctx) => {
    let user = loadJSON(USERS_FILE).find(u => u.chatId === ctx.chat.id);
    if (user) sendProfile(ctx, user);
});

bot.action('refresh_stats', async (ctx) => {
    let user = loadJSON(USERS_FILE).find(u => u.chatId === ctx.from.id);
    try { await ctx.deleteMessage(); } catch (e) {}
    sendProfile(ctx, user);
});

bot.launch();
console.log("🚀 EURO MASTER BOT ONLINE (ADMIN ID: 8230113306)");