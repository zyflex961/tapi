import { Telegraf, Markup } from 'telegraf';
import fs from 'fs';
import path from 'path';

export default function initEuroBot(bot) {
    const ADMIN_ID = 8230113306; 
    const WEB_APP_URL = 'Https://t.me/DPSwallet_bot?startapp';
    const DEFAULT_PHOTO = 'https://i.ibb.co/L8N9m9p/euro-banner.jpg'; // آپ اسے DPS لوگو سے بدل سکتے ہیں

    const USERS_FILE = path.join(process.cwd(), 'users.json');
    const TASKS_FILE = path.join(process.cwd(), 'tasks.json');

    const loadJSON = (file) => {
        if (!fs.existsSync(file)) return [];
        try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return []; }
    };
    const saveJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

    /* ------------------ پروفائل سسٹم ------------------ */
    async function sendProfile(ctx, user) {
        const refLink = `https://t.me/${ctx.botInfo.username}?start=${user.chatId}`;
        const profileMsg = 
            `💎 *DPS DIGITAL WALLET*\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `🆔 *Account ID:* \`${user.chatId}\`\n` +
            `💰 *Available Balance:* **${user.balance} DPS**\n` +
            `👥 *Total Referrals:* ${user.referCount}\n\n` +
            `🔗 *Referral Link:*\n\`${refLink}\`\n\n` +
            `🚀 *Earn 200 DPS for every friend you invite!* 💸`;

        await ctx.replyWithPhoto(DEFAULT_PHOTO, {
            caption: profileMsg,
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.url('🚀 Open DPS Wallet App', WEB_APP_URL)],
                [Markup.button.callback('💰 Deposit DPS Tokens', 'buy_euro')],
                [Markup.button.callback('🎁 Daily Tasks', 'view_tasks'), Markup.button.callback('🔄 Refresh', 'refresh_stats')]
            ])
        });
    }

    /* ------------------ سٹارٹ اور ریفرل ------------------ */
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
                    bot.telegram.sendMessage(refBy, `🎊 *Referral Alert!*\nSomeone joined via your link. You earned **200 DPS**!`, { parse_mode: 'Markdown' }).catch(() => {});
                }
            }
            user = { chatId, username: ctx.from.username || 'User', balance: bonus, referCount: 0, completedTasks: [], joinedAt: new Date().toISOString() };
            users.push(user);
            saveJSON(USERS_FILE, users);
        }

        const welcomeText = `👋 *Welcome to DPS Wallet!*\n\n` +
            `💎 *Join Bonus:* 50 DPS (Referral only)\n` +
            `👥 *Refer Reward:* 200 DPS per friend\n` +
            `💸 *Inline Transfer:* Send DPS in any chat!\n` +
            `🏦 *Deposit:* Local banks & Crypto supported.`;
        
        await ctx.replyWithMarkdown(welcomeText);
        sendProfile(ctx, user);
    });

    /* ------------------ ان لائن فنڈ ٹرانسفر (P2P) ------------------ */
    bot.on('inline_query', async (ctx) => {
        const amount = parseInt(ctx.inlineQuery.query.trim());
        if (!amount || amount <= 0) return ctx.answerInlineQuery([]);

        const results = [{
            type: 'article',
            id: `send_${Date.now()}`,
            title: `💸 Send ${amount} DPS`,
            input_message_content: {
                message_text: `🌟 *DPS TOKEN TRANSFER*\n\nI am sending you **${amount} DPS**. \n\n_Claim via the button below!_`,
                parse_mode: 'Markdown'
            },
            ...Markup.inlineKeyboard([[Markup.button.callback('📊 Claim DPS', `receive_${amount}_${ctx.from.id}`)]])
        }];
        ctx.answerInlineQuery(results, { cache_time: 0 });
    });

    bot.action(/receive_(\d+)_(\d+)/, (ctx) => {
        const amount = parseInt(ctx.match[1]);
        const senderId = parseInt(ctx.match[2]);
        let users = loadJSON(USERS_FILE);
        if (ctx.from.id == senderId) return ctx.answerCbQuery("❌ Self-claim not allowed!");

        const sIdx = users.findIndex(u => u.chatId == senderId);
        if (senderId !== ADMIN_ID && (sIdx === -1 || users[sIdx].balance < amount)) return ctx.answerCbQuery("❌ Insufficient DPS.");

        let rIdx = users.findIndex(u => u.chatId == ctx.from.id);
        if (rIdx === -1) {
            users.push({ chatId: ctx.from.id, username: ctx.from.username, balance: 0, referCount: 0, completedTasks: [] });
            rIdx = users.length - 1;
        }

        if (senderId !== ADMIN_ID) users[sIdx].balance -= amount;
        users[rIdx].balance += amount;
        saveJSON(USERS_FILE, users);

        ctx.editMessageText(`✅ *Transfer Complete!* ${ctx.from.first_name} claimed **${amount} DPS**.`);
    });

    /* ------------------ ٹاسک سسٹم ------------------ */
    bot.action('view_tasks', (ctx) => {
        const tasks = loadJSON(TASKS_FILE);
        const user = loadJSON(USERS_FILE).find(u => u.chatId === ctx.from.id);
        if (!tasks.length) return ctx.answerCbQuery("No tasks.");

        const buttons = tasks.map(t => {
            const done = user.completedTasks.includes(t.id);
            return [
                Markup.button.url(`${t.title} ${done ? '✅' : `(+${t.reward} DPS)`}`, t.url),
                Markup.button.callback(done ? '✓' : 'Verify ✅', `v_${t.id}`)
            ];
        });
        ctx.editMessageCaption("🎁 *Complete tasks to earn DPS rewards:*", { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
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
        ctx.reply(`✅ *Success!* You earned **${task.reward} DPS**.`);
    });

    /* ------------------ ڈیپازٹ اور ایڈمن کنٹرول ------------------ */
    bot.action('buy_euro', (ctx) => {
        ctx.replyWithMarkdown(`💰 *DEPOSIT DPS TOKENS*\n\n🇵🇰 JazzCash/Bank | 🌐 USDT (TRC20): \`TYuR789...Address\`\n\n📝 Send payment and upload Screenshot!`);
    });

    bot.on(['photo', 'text'], async (ctx, next) => {
        if (ctx.message.text && ctx.message.text.startsWith('/')) return next();
        await ctx.forwardMessage(ADMIN_ID);
        bot.telegram.sendMessage(ADMIN_ID, `📩 *Request* from \`${ctx.from.id}\``, 
            Markup.inlineKeyboard([[Markup.button.callback('✅ Approve 1000 DPS', `app_1000_${ctx.from.id}`)]])
        );
        ctx.reply("⏳ Sent to Admin!");
    });

    bot.action(/app_(\d+)_(\d+)/, (ctx) => {
        const amount = parseInt(ctx.match[1]);
        const tid = parseInt(ctx.match[2]);
        let users = loadJSON(USERS_FILE);
        let u = users.find(x => x.chatId == tid);
        if (u) {
            u.balance += amount;
            saveJSON(USERS_FILE, users);
            bot.telegram.sendMessage(tid, `🎉 *Approved!* ${amount} DPS added.`);
            ctx.editMessageText(`✅ Approved ${amount} DPS`);
        }
    });

    /* ------------------ ایڈمن کمانڈز ------------------ */
    bot.command('total', (ctx) => {
        if (ctx.from.id === ADMIN_ID) ctx.reply(`📊 Total Users: ${loadJSON(USERS_FILE).length}`);
    });

    bot.command('broadcast', async (ctx) => {
        if (ctx.from.id !== ADMIN_ID) return;
        const msg = ctx.message.text.replace('/broadcast', '').trim();
        const users = loadJSON(USERS_FILE);
        for (const u of users) { try { await bot.telegram.sendMessage(u.chatId, `📢 ${msg}`); } catch (e) {} }
        ctx.reply("✅ Sent!");
    });

    bot.command('addtask', (ctx) => {
        if (ctx.from.id !== ADMIN_ID) return;
        const p = ctx.message.text.split('|');
        let tasks = loadJSON(TASKS_FILE);
        tasks.push({ id: p[0].replace('/addtask','').trim(), title: p[1].trim(), reward: parseInt(p[2]), url: p[3].trim() });
        saveJSON(TASKS_FILE, tasks);
        ctx.reply("✅ Task Added!");
    });

    bot.action('refresh_stats', async (ctx) => {
        let user = loadJSON(USERS_FILE).find(u => u.chatId === ctx.from.id);
        try { await ctx.deleteMessage(); } catch (e) {}
        sendProfile(ctx, user);
    });
}
