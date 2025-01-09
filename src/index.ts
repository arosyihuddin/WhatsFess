import { BaileysClass } from "./bot";

(async () => {
    const bot = new BaileysClass();
    console.log("Connecting to WhatsApp API...");

    bot.on("ready", () => {
        console.log("Bot is ready to receive messages!");
        // bot.sendMessage("1234567890", "Hello from Baileys!");
    });

    bot.on("error", (err) => {
        console.error("Error:", err);
    });

})();