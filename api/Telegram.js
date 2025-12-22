import { Telegraf, Markup } from "telegraf";
import fs from "fs";
import path from "path";
import "dotenv/config";

let botInstance = null;

export default function initEuroBot() {
    if (botInstance) {
        console.log("⚠️ Telegram bot already initialized");
        return botInstance;
    }

    const BOT_TOKEN = process.env.BOT_TOKEN;
    if (!BOT_TOKEN) {
        console.error("❌ BOT_TOKEN not found in environment");
        return null;
    }

    const bot = new Telegraf(BOT_TOKEN);
    botInstance = bot;

    const ADMIN_ID = 8230113306;
    const WEB_APP_URL = "https://t.me/DPSwallet_bot?startapp";
    const DEFAULT_PHOTO = "https://i.ibb.co/L8N9m9p/euro-banner.jpg";

    const USERS_FILE = path.join(process.cwd(), "users.json");
    const TASKS_FILE = path.join(process.cwd(), "tasks.json");

    /* =======================
       Helpers
    ======================= */

    const loadJSON = (file) => {
        if (!fs.existsSync(file)) return [];
        try {
            return JSON.parse(fs.readFileSync(file, "utf8"));
        } catch {
            return [];
        }
    };

    const saveJSON = (file, data) => {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
    };

    /* =======================
       Profile Card
    ======================= */

    async function sendProfile(ctx, user) {
        const refLink = `https://t.me/${ctx.botInfo.username}?start=${user.chatId}`;

        const text =
            `💎 *DPS DIGITAL WALLET*\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `🆔 *Account ID:* \`${user.chatId}\`\n` +
            `💰 *Available Balance:* **${user.balance} DPS**\n` +
            `👥 *Total Referrals:* ${user.referCount}\n\n` +
            `🔗 *Referral Link:*\n\`${refLink}\`\n\n` +
            `🚀 *Earn 200 DPS per referral!*`;

        await ctx.replyWithPhoto(DEFAULT_PHOTO, {
            caption: text,
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
                [Markup.button.url("🚀 Open DPS Wallet App", WEB_APP_URL)],
                [Markup.button.callback("💰 Deposit DPS", "buy_euro")],
                [
                    Markup.button.callback("🎁 Daily Tasks", "view_tasks"),
                    Markup.button.callback("🔄 Refresh", "refresh_stats"),
                ],
            ]),
        });
    }

    /* =======================
       /start + Referral
    ======================= */

    bot.start(async (ctx) => {
        const chatId = ctx.chat.id;
        const refBy = ctx.payload;

        let users = loadJSON(USERS_FILE);
        let user = users.find((u) => u.chatId === chatId);

        if (!user) {
            let bonus = 0;

            if (refBy && refBy != chatId) {
                const inviter = users.find((u) => u.chatId == refBy);
                if (inviter) {
                    inviter.balance += 200;
                    inviter.referCount += 1;
                    bonus = 50;

                    bot.telegram.sendMessage(
                        refBy,
                        "🎊 *Referral Bonus!* You earned **200 DPS**",
                        { parse_mode: "Markdown" }
                    ).catch(() => {});
                }
            }

            user = {
                chatId,
                username: ctx.from.username || "User",
                balance: bonus,
                referCount: 0,
                completedTasks: [],
                joinedAt: new Date().toISOString(),
            };

            users.push(user);
            saveJSON(USERS_FILE, users);
        }

        await ctx.replyWithMarkdown(
            "👋 *Welcome to DPS Wallet!*\n\n" +
            "💸 Refer & Earn DPS\n" +
            "🏦 Deposit via Bank or Crypto\n\n" +
            "نیچے دیے گئے بٹن استعمال کریں 👇"
        );

        await sendProfile(ctx, user);
    });

    /* =======================
       Inline Transfer
    ======================= */

    bot.on("inline_query", async (ctx) => {
        const amount = parseInt(ctx.inlineQuery.query);
        if (!amount || amount <= 0) return ctx.answerInlineQuery([]);

        await ctx.answerInlineQuery(
            [
                {
                    type: "article",
                    id: String(Date.now()),
                    title: `Send ${amount} DPS`,
                    input_message_content: {
                        message_text: `💸 Sending **${amount} DPS**`,
                        parse_mode: "Markdown",
                    },
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback("📥 Claim DPS", `receive_${amount}_${ctx.from.id}`)],
                    ]),
                },
            ],
            { cache_time: 0 }
        );
    });

    bot.action(/receive_(\d+)_(\d+)/, (ctx) => {
        const amount = Number(ctx.match[1]);
        const senderId = Number(ctx.match[2]);

        let users = loadJSON(USERS_FILE);

        if (ctx.from.id === senderId)
            return ctx.answerCbQuery("❌ You cannot claim your own transfer");

        const sender = users.find((u) => u.chatId === senderId);
        if (senderId !== ADMIN_ID && (!sender || sender.balance < amount))
            return ctx.answerCbQuery("❌ Insufficient balance");

        let receiver = users.find((u) => u.chatId === ctx.from.id);
        if (!receiver) {
            receiver = { chatId: ctx.from.id, balance: 0, referCount: 0, completedTasks: [] };
            users.push(receiver);
        }

        if (senderId !== ADMIN_ID) sender.balance -= amount;
        receiver.balance += amount;

        saveJSON(USERS_FILE, users);
        ctx.editMessageText(`✅ *${amount} DPS received!*`, { parse_mode: "Markdown" });
    });

    /* =======================
       Tasks
    ======================= */

    bot.action("view_tasks", (ctx) => {
        const tasks = loadJSON(TASKS_FILE);
        const user = loadJSON(USERS_FILE).find((u) => u.chatId === ctx.from.id);
        if (!tasks.length) return ctx.answerCbQuery("No tasks");

        const buttons = tasks.map((t) => [
            Markup.button.url(`${t.title} (+${t.reward} DPS)`, t.url),
            Markup.button.callback("Verify ✅", `v_${t.id}`),
        ]);

        ctx.editMessageCaption("🎁 *Complete tasks:*", {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard(buttons),
        });
    });

    bot.action(/v_(.+)/, (ctx) => {
        const tid = ctx.match[1];
        let users = loadJSON(USERS_FILE);
        let user = users.find((u) => u.chatId === ctx.from.id);
        const task = loadJSON(TASKS_FILE).find((t) => t.id === tid);

        if (!task || user.completedTasks.includes(tid))
            return ctx.answerCbQuery("Already done");

        user.balance += task.reward;
        user.completedTasks.push(tid);
        saveJSON(USERS_FILE, users);

        ctx.reply(`✅ You earned **${task.reward} DPS**`, { parse_mode: "Markdown" });
    });

    /* =======================
       Launch (MOST IMPORTANT)
    ======================= */

    bot.launch();
    console.log("✅ Telegram Bot STARTED (Render ready)");

    process.once("SIGINT", () => bot.stop("SIGINT"));
    process.once("SIGTERM", () => bot.stop("SIGTERM"));

    return bot;
}