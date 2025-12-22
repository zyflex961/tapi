import { Telegraf, Markup } from "telegraf";
import fs from "fs";
import path from "path";
import "dotenv/config";

let botStarted = false;

export default function initEuroBot() {
    if (botStarted) return;
    botStarted = true;

    const BOT_TOKEN = process.env.BOT_TOKEN;
    if (!BOT_TOKEN) {
        console.error("❌ BOT_TOKEN missing");
        return;
    }

    const bot = new Telegraf(BOT_TOKEN);

    const ADMIN_ID = 8230113306;
    const WEB_APP_URL = "https://t.me/DPSwallet_bot?startapp";
    const DEFAULT_PHOTO = "https://i.ibb.co/L8N9m9p/euro-banner.jpg";

    const USERS_FILE = path.join(process.cwd(), "users.json");
    const TASKS_FILE = path.join(process.cwd(), "tasks.json");

    /* ================= HELPERS ================= */

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

    /* ================= PROFILE CARD ================= */

    async function sendProfile(ctx, user) {
        const refLink = `https://t.me/${ctx.botInfo.username}?start=${user.chatId}`;

        const text =
            `💎 *DPS DIGITAL WALLET*\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `🆔 *Account ID:* \`${user.chatId}\`\n` +
            `💰 *Balance:* **${user.balance} DPS**\n` +
            `👥 *Referrals:* ${user.referCount}\n\n` +
            `🔗 *Your Referral Link:*\n` +
            `\`${refLink}\`\n\n` +
            `🚀 *Invite friends & earn 200 DPS per referral!*`;

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

    /* ================= START + REFERRAL ================= */

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
                        "🎊 *Referral Bonus!*\nYou earned **200 DPS**",
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
            `👋 *Welcome to DPS Digital Wallet!*\n\n` +
            `💎 Earn DPS by completing tasks\n` +
            `👥 Refer friends & earn rewards\n` +
            `🏦 Deposit via Bank or Crypto\n\n` +
            `👇 *Use the buttons below to continue*`
        );

        await sendProfile(ctx, user);
    });

    /* ================= PROFILE COMMAND ================= */

    bot.command("profile", (ctx) => {
        const user = loadJSON(USERS_FILE).find(u => u.chatId === ctx.chat.id);
        if (!user) return ctx.reply("❌ Profile not found");
        sendProfile(ctx, user);
    });

    /* ================= TASK SYSTEM ================= */

    bot.action("view_tasks", (ctx) => {
        const tasks = loadJSON(TASKS_FILE);
        const users = loadJSON(USERS_FILE);
        const user = users.find(u => u.chatId === ctx.from.id);

        if (!tasks.length)
            return ctx.answerCbQuery("No tasks available");

        const buttons = tasks.map(t => {
            const done = user.completedTasks.includes(t.id);
            return [
                Markup.button.url(
                    `${t.title} ${done ? "✅" : `(+${t.reward} DPS)`}`,
                    t.url
                ),
                Markup.button.callback(
                    done ? "Verified ✓" : "Verify",
                    `v_${t.id}`
                )
            ];
        });

        ctx.editMessageCaption("🎁 *Complete tasks to earn DPS:*", {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard(buttons),
        });
    });

    bot.action(/v_(.+)/, (ctx) => {
        const taskId = ctx.match[1];
        let users = loadJSON(USERS_FILE);
        let user = users.find(u => u.chatId === ctx.from.id);
        const task = loadJSON(TASKS_FILE).find(t => t.id === taskId);

        if (!task) return ctx.answerCbQuery("Invalid task");
        if (user.completedTasks.includes(taskId))
            return ctx.answerCbQuery("Already completed");

        user.balance += task.reward;
        user.completedTasks.push(taskId);
        saveJSON(USERS_FILE, users);

        ctx.reply(`✅ *Task completed!* You earned **${task.reward} DPS**`, {
            parse_mode: "Markdown",
        });
    });

    /* ================= REFRESH ================= */

    bot.action("refresh_stats", async (ctx) => {
        const user = loadJSON(USERS_FILE).find(u => u.chatId === ctx.from.id);
        try { await ctx.deleteMessage(); } catch {}
        sendProfile(ctx, user);
    });

    /* ================= DEPOSIT ================= */

    bot.action("buy_euro", (ctx) => {
        ctx.replyWithMarkdown(
            `💰 *Deposit DPS*\n\n` +
            `🇵🇰 Pakistan: JazzCash / EasyPaisa\n` +
            `🇮🇳 India: UPI\n` +
            `🌍 Global: USDT (TRC20)\n\n` +
            `📤 Send screenshot here for approval`
        );
    });

    /* ================= LAUNCH ================= */

    bot.launch();
    console.log("✅ Telegram Bot FULLY ACTIVE");

    process.once("SIGINT", () => bot.stop("SIGINT"));
    process.once("SIGTERM", () => bot.stop("SIGTERM"));
}