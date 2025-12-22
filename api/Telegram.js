import { Telegraf, Markup } from "telegraf";
import fs from "fs";
import path from "path";
import "dotenv/config";

export default function initEuroBot() {
    const BOT_TOKEN = process.env.BOT_TOKEN;
    if (!BOT_TOKEN) {
        console.log("❌ BOT_TOKEN missing");
        return;
    }

    const bot = new Telegraf(BOT_TOKEN);

    const ADMIN_ID = 8230113306;
    const WEB_APP_URL = "https://t.me/DPSwallet_bot?startapp";

    const USERS_FILE = path.join(process.cwd(), "users.json");
    const TASKS_FILE = path.join(process.cwd(), "tasks.json");

    const load = (file, def = []) => {
        if (!fs.existsSync(file)) return def;
        try {
            return JSON.parse(fs.readFileSync(file, "utf8"));
        } catch {
            return def;
        }
    };

    const save = (file, data) =>
        fs.writeFileSync(file, JSON.stringify(data, null, 2));

    /* =========================
       PROFILE MESSAGE
    ========================= */
    async function sendProfile(ctx, user) {
        const refLink = `https://t.me/${ctx.botInfo.username}?start=${user.chatId}`;

        await ctx.reply(
            `💎 DPS DIGITAL WALLET
━━━━━━━━━━━━━━━━━━━━

🆔 Account ID: ${user.chatId}
💰 Balance: ${user.balance} DPS
👥 Referrals: ${user.referCount}

🔗 Referral Link:
${refLink}

Invite friends and earn 200 DPS per referral.`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: "🚀 Open Wallet App",
                                web_app: { url: WEB_APP_URL }
                            }
                        ],
                        [
                            { text: "🎁 Tasks", callback_data: "tasks" },
                            { text: "💰 Deposit", callback_data: "deposit" }
                        ],
                        [
                            { text: "🔄 Refresh", callback_data: "refresh" }
                        ]
                    ]
                }
            }
        );
    }

    /* =========================
       /START + REFERRAL
    ========================= */
    bot.start(async (ctx) => {
        const chatId = ctx.chat.id;
        const refBy = ctx.payload;

        let users = load(USERS_FILE);
        let user = users.find(u => u.chatId === chatId);

        if (!user) {
            let bonus = 0;

            if (refBy && refBy != chatId) {
                const inviter = users.find(u => u.chatId == refBy);
                if (inviter) {
                    inviter.balance += 200;
                    inviter.referCount += 1;
                    bonus = 50;

                    bot.telegram.sendMessage(
                        refBy,
                        "🎉 You earned 200 DPS from a referral!"
                    ).catch(() => {});
                }
            }

            user = {
                chatId,
                username: ctx.from.username || "User",
                balance: bonus,
                referCount: 0,
                completedTasks: []
            };

            users.push(user);
            save(USERS_FILE, users);
        }

        await ctx.reply(
            "👋 Welcome to DPS Digital Wallet!\n\nEarn DPS by referrals, tasks and transfers."
        );

        await sendProfile(ctx, user);
    });

    /* =========================
       COMMANDS
    ========================= */
    bot.command("profile", (ctx) => {
        const user = load(USERS_FILE).find(u => u.chatId === ctx.chat.id);
        if (user) sendProfile(ctx, user);
    });

    bot.command("tasks", (ctx) => ctx.answerCbQuery?.() || ctx.reply("Use the Tasks button."));
    bot.command("deposit", (ctx) => ctx.reply("Use the Deposit button below."));

    /* =========================
       TASK SYSTEM
    ========================= */
    bot.action("tasks", (ctx) => {
        const tasks = load(TASKS_FILE);
        const users = load(USERS_FILE);
        const user = users.find(u => u.chatId === ctx.from.id);

        if (!tasks.length) {
            return ctx.answerCbQuery("No tasks available.");
        }

        const buttons = tasks.map(t => {
            const done = user.completedTasks.includes(t.id);
            return [
                Markup.button.url(
                    `${t.title} ${done ? "✅" : `(+${t.reward} DPS)`}`,
                    t.url
                ),
                Markup.button.callback(
                    done ? "Verified" : "Verify",
                    `verify_${t.id}`
                )
            ];
        });

        ctx.editMessageText("🎁 Complete tasks to earn DPS:", {
            reply_markup: { inline_keyboard: buttons }
        });
    });

    bot.action(/verify_(.+)/, (ctx) => {
        const taskId = ctx.match[1];
        const users = load(USERS_FILE);
        const tasks = load(TASKS_FILE);

        const user = users.find(u => u.chatId === ctx.from.id);
        const task = tasks.find(t => t.id === taskId);

        if (!task || user.completedTasks.includes(taskId)) {
            return ctx.answerCbQuery("Already completed.");
        }

        user.balance += task.reward;
        user.completedTasks.push(taskId);
        save(USERS_FILE, users);

        ctx.reply(`✅ Task completed! +${task.reward} DPS`);
    });

    /* =========================
       DEPOSIT
    ========================= */
    bot.action("deposit", (ctx) => {
        ctx.reply(
            `💰 DPS Deposit

Send payment proof to admin.
Supported: Bank / Crypto (USDT TRC20)`
        );
    });

    /* =========================
       INLINE TRANSFER (P2P)
    ========================= */
    bot.on("inline_query", (ctx) => {
        const amount = parseInt(ctx.inlineQuery.query);
        if (!amount || amount <= 0) return ctx.answerInlineQuery([]);

        ctx.answerInlineQuery([
            {
                type: "article",
                id: Date.now().toString(),
                title: `Send ${amount} DPS`,
                input_message_content: {
                    message_text: `💸 I am sending you ${amount} DPS`
                },
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: "Claim DPS",
                                callback_data: `claim_${amount}_${ctx.from.id}`
                            }
                        ]
                    ]
                }
            }
        ]);
    });

    bot.action(/claim_(\d+)_(\d+)/, (ctx) => {
        const amount = parseInt(ctx.match[1]);
        const senderId = parseInt(ctx.match[2]);

        const users = load(USERS_FILE);
        const sender = users.find(u => u.chatId === senderId);
        const receiver =
            users.find(u => u.chatId === ctx.from.id) ||
            users[users.push({
                chatId: ctx.from.id,
                balance: 0,
                referCount: 0,
                completedTasks: []
            }) - 1];

        if (!sender || sender.balance < amount) {
            return ctx.answerCbQuery("Insufficient balance.");
        }

        sender.balance -= amount;
        receiver.balance += amount;
        save(USERS_FILE, users);

        ctx.editMessageText(`✅ ${amount} DPS transferred successfully.`);
    });

    /* =========================
       ADMIN COMMANDS
    ========================= */
    bot.command("addtask", (ctx) => {
        if (ctx.from.id !== ADMIN_ID) return;

        const [, id, title, reward, url] = ctx.message.text.split("|");
        if (!id || !title || !reward || !url) {
            return ctx.reply("Usage: /addtask|id|title|reward|url");
        }

        const tasks = load(TASKS_FILE);
        tasks.push({
            id: id.trim(),
            title: title.trim(),
            reward: parseInt(reward),
            url: url.trim()
        });
        save(TASKS_FILE, tasks);

        ctx.reply("✅ Task added.");
    });

    bot.command("total", (ctx) => {
        if (ctx.from.id !== ADMIN_ID) return;
        ctx.reply(`👥 Total users: ${load(USERS_FILE).length}`);
    });

    /* =========================
       START BOT
    ========================= */
    bot.launch();
    console.log("✅ Telegram Bot Started");

    process.once("SIGTERM", () => bot.stop("SIGTERM"));
    process.once("SIGINT", () => bot.stop("SIGINT"));
}