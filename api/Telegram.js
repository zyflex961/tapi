import { Telegraf } from "telegraf";
import fs from "fs";
import path from "path";
import "dotenv/config";

let started = false;

export default function initEuroBot() {
    if (started) return;
    started = true;

    const BOT_TOKEN = process.env.BOT_TOKEN;
    if (!BOT_TOKEN) {
        console.error("BOT_TOKEN missing");
        return;
    }

    const bot = new Telegraf(BOT_TOKEN);

    const ADMIN_ID = 8230113306;
    const WEB_APP_URL = "https://t.me/DPSwallet_bot?startapp";
    const DEFAULT_PHOTO = "https://i.ibb.co/L8N9m9p/euro-banner.jpg";

    const USERS_FILE = path.join(process.cwd(), "users.json");
    const TASKS_FILE = path.join(process.cwd(), "tasks.json");

    /* ========= helpers ========= */

    const loadJSON = (f) => {
        if (!fs.existsSync(f)) return [];
        try { return JSON.parse(fs.readFileSync(f, "utf8")); }
        catch { return []; }
    };

    const saveJSON = (f, d) =>
        fs.writeFileSync(f, JSON.stringify(d, null, 2));

    const getUser = (users, id) => {
        let u = users.find(x => x.chatId === id);
        if (!u) {
            u = { chatId: id, balance: 0, referCount: 0, completedTasks: [] };
            users.push(u);
        }
        return u;
    };

    /* ========= profile ========= */

    async function sendProfile(ctx, user) {
        const refLink = `https://t.me/${ctx.botInfo.username}?start=${user.chatId}`;

        await ctx.replyWithPhoto(DEFAULT_PHOTO, {
            caption:
                `💎 *DPS DIGITAL WALLET*\n` +
                `━━━━━━━━━━━━━━━━━━━━\n\n` +
                `🆔 Account ID: \`${user.chatId}\`\n` +
                `💰 Balance: *${user.balance} DPS*\n` +
                `👥 Referrals: *${user.referCount}*\n\n` +
                `🔗 *Referral Link*\n` +
                `\`${refLink}\`\n\n` +
                `Invite friends and earn *200 DPS* per referral.`,
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🚀 Open DPS Wallet App", url: WEB_APP_URL }],
                    [{ text: "💰 Deposit DPS", callback_data: "deposit" }],
                    [
                        { text: "🎁 Tasks", callback_data: "tasks" },
                        { text: "🔄 Refresh", callback_data: "refresh" }
                    ]
                ]
            }
        });
    }

    /* ========= start ========= */

    bot.start(async (ctx) => {
        const chatId = ctx.chat.id;
        const refBy = ctx.payload;

        let users = loadJSON(USERS_FILE);
        let user = users.find(u => u.chatId === chatId);

        if (!user) {
            let bonus = 0;
            if (refBy && refBy != chatId) {
                const inviter = users.find(u => u.chatId == refBy);
                if (inviter) {
                    inviter.balance += 200;
                    inviter.referCount += 1;
                    bonus = 50;
                }
            }
            user = { chatId, balance: bonus, referCount: 0, completedTasks: [] };
            users.push(user);
            saveJSON(USERS_FILE, users);
        }

        sendProfile(ctx, user);
    });

    /* ========= commands ========= */

    bot.command("profile", (ctx) => {
        const user = loadJSON(USERS_FILE).find(u => u.chatId === ctx.chat.id);
        if (!user) return ctx.reply("Profile not found");
        sendProfile(ctx, user);
    });

    bot.command("tasks", (ctx) => showTasks(ctx));
    bot.command("deposit", (ctx) => depositInfo(ctx));

    /* ========= tasks ========= */

    function showTasks(ctx) {
        const tasks = loadJSON(TASKS_FILE);
        const users = loadJSON(USERS_FILE);
        const user = getUser(users, ctx.from.id);

        if (!tasks.length)
            return ctx.reply("No tasks available");

        const keyboard = tasks.map(t => [
            { text: `${t.title} (+${t.reward} DPS)`, url: t.url },
            { text: "Verify", callback_data: `v_${t.id}` }
        ]);

        ctx.reply("🎁 *Available Tasks*", {
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: keyboard }
        });
    }

    bot.action("tasks", (ctx) => showTasks(ctx));

    bot.action(/v_(.+)/, (ctx) => {
        const taskId = ctx.match[1];
        let users = loadJSON(USERS_FILE);
        let user = getUser(users, ctx.from.id);
        const task = loadJSON(TASKS_FILE).find(t => t.id === taskId);

        if (!task) return ctx.answerCbQuery("Invalid task");
        if (user.completedTasks.includes(taskId))
            return ctx.answerCbQuery("Already completed");

        user.balance += task.reward;
        user.completedTasks.push(taskId);
        saveJSON(USERS_FILE, users);

        ctx.answerCbQuery("Task completed");
    });

    /* ========= deposit ========= */

    function depositInfo(ctx) {
        ctx.reply(
            "💰 Deposit DPS\n\n" +
            "Pakistan: JazzCash / EasyPaisa\n" +
            "India: UPI\n" +
            "Global: USDT (TRC20)\n\n" +
            "Send payment proof here."
        );
    }

    bot.action("deposit", (ctx) => depositInfo(ctx));

    /* ========= refresh ========= */

    bot.action("refresh", async (ctx) => {
        const user = loadJSON(USERS_FILE).find(u => u.chatId === ctx.from.id);
        try { await ctx.deleteMessage(); } catch {}
        sendProfile(ctx, user);
    });

    /* ========= INLINE P2P TRANSFER (RESTORED) ========= */

    bot.on("inline_query", async (ctx) => {
        const amount = parseInt(ctx.inlineQuery.query);
        if (!amount || amount <= 0) return ctx.answerInlineQuery([]);

        await ctx.answerInlineQuery([{
            type: "article",
            id: String(Date.now()),
            title: `Send ${amount} DPS`,
            input_message_content: {
                message_text:
                    `💸 *DPS Transfer*\n\n` +
                    `You are sending *${amount} DPS*.\n\n` +
                    `Click the button below to claim.`,
                parse_mode: "Markdown"
            },
            reply_markup: {
                inline_keyboard: [
                    [{ text: "📥 Claim DPS", callback_data: `claim_${amount}_${ctx.from.id}` }]
                ]
            }
        }], { cache_time: 0 });
    });

    bot.action(/claim_(\d+)_(\d+)/, (ctx) => {
        const amount = Number(ctx.match[1]);
        const senderId = Number(ctx.match[2]);

        let users = loadJSON(USERS_FILE);
        let sender = getUser(users, senderId);
        let receiver = getUser(users, ctx.from.id);

        if (ctx.from.id === senderId)
            return ctx.answerCbQuery("You cannot claim your own transfer");

        if (senderId !== ADMIN_ID && sender.balance < amount)
            return ctx.answerCbQuery("Insufficient balance");

        if (senderId !== ADMIN_ID) sender.balance -= amount;
        receiver.balance += amount;

        saveJSON(USERS_FILE, users);

        ctx.editMessageText(
            `✅ Transfer successful!\n${amount} DPS credited.`,
            { parse_mode: "Markdown" }
        );
    });

    /* ========= admin ========= */

    bot.command("total", (ctx) => {
        if (ctx.from.id !== ADMIN_ID) return;
        ctx.reply(`Total users: ${loadJSON(USERS_FILE).length}`);
    });

    bot.command("addtask", (ctx) => {
        if (ctx.from.id !== ADMIN_ID) return;

        const p = ctx.message.text.split("|");
        if (p.length < 4)
            return ctx.reply("Usage: /addtask id | title | reward | url");

        let tasks = loadJSON(TASKS_FILE);
        tasks.push({
            id: p[0].replace("/addtask", "").trim(),
            title: p[1].trim(),
            reward: parseInt(p[2]),
            url: p[3].trim()
        });
        saveJSON(TASKS_FILE, tasks);
        ctx.reply("Task added");
    });

    /* ========= launch ========= */

    bot.launch();
    console.log("Telegram bot started with inline transfer enabled");

    process.once("SIGINT", () => bot.stop());
    process.once("SIGTERM", () => bot.stop());
}