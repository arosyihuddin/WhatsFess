import { EventEmitter } from "events";
import pino, { Logger } from "pino";
import NodeCache from "node-cache";
import makeWASocket, {
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    makeInMemoryStore,
    useMultiFileAuthState,
    Browsers,
    WAMessageContent,
    WAMessageKey,
    proto,
} from "@whiskeysockets/baileys";
import { existsSync, rmSync } from "fs";
import { join } from "path";
import qrcode from "qrcode-terminal";
import { WAMessage } from "@whiskeysockets/baileys";
import dotenv from "dotenv";
import { openaiChat } from "./openai";
dotenv.config();

export class BaileysClass extends EventEmitter {
    private store: any;
    private sock: any;
    private readonly sessionPath: string;
    private readonly msgRetryCounterCache = new NodeCache();
    private readonly logger: Logger = pino({ level: "warn" });

    constructor(private readonly sessionName: string = "session") {
        super();
        // Pengecekan apakah WHTASPP_NUMBER ada di .env
        if (!process.env.WHTASPP_NUMBER || !process.env.BOT_NAME) {
            console.error("WHTASPP_NUMBER OR BOT_NAME is not defined in the environment variables.");
            process.exit(1);  // Keluar jika variabel environment tidak ditemukan
        }
        this.sessionPath = join(process.cwd(), `auth/${this.sessionName}`);
        this.initBailey();
    }

    private initBailey = async (): Promise<void> => {
        try {
            const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath);
            const { version, isLatest } = await fetchLatestBaileysVersion();
            console.log(`Using WA version ${version.join(".")}, isLatest: ${isLatest}`);

            this.store = makeInMemoryStore({ logger: this.logger as any });
            this.store.readFromFile(`${this.sessionPath}/store.json`);
            setInterval(() => {
                if (existsSync(`${this.sessionPath}/store.json`)) {
                    this.store.writeToFile(`${this.sessionPath}/store.json`);
                }
            }, 10000);

            this.sock = makeWASocket({
                version,
                logger: this.logger as any,
                printQRInTerminal: true,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, this.logger as any),
                },
                browser: Browsers.macOS("Desktop"),
                msgRetryCounterCache: this.msgRetryCounterCache,
                generateHighQualityLinkPreview: true,
                getMessage: this.getMessage,
            });

            this.store?.bind(this.sock.ev);

            this.sock.ev.removeAllListeners("connection.update");
            this.sock.ev.on("connection.update", this.handleConnectionUpdate);
            this.sock.ev.on("creds.update", saveCreds);

            this.sock.ev.on("connection.update", (update: any) => {
                if (update.connection === "open") {
                    if (this.sock && this.sock.ev) {
                        this.listenForMessages();  // Mendengarkan Semua Pesan yang masuk
                    } else {
                        console.error("Socket belum diinisialisasi.");
                    }
                }
            });

        } catch (err) {
            console.error("Error initializing Baileys:", err);
            this.emit("error", err);
        }
    };

    private handleConnectionUpdate = (update: any): void => {
        const { connection, lastDisconnect, qr } = update;
        const statusCode = lastDisconnect?.error?.output?.statusCode;

        if (connection === "close") {
            if (statusCode !== DisconnectReason.loggedOut) this.initBailey();
            if (statusCode === DisconnectReason.loggedOut) this.clearSession();
        }

        if (connection === "open") {
            console.log("WhatsApp berhasil terhubung!");
            this.emit("ready");
        }

        if (qr) {
            console.clear();
            qrcode.generate(qr, { small: true });
            console.log("Pindai kode QR untuk masuk");
            this.emit("qr", qr);
        }
    };

    private clearSession = (): void => {
        rmSync(this.sessionPath, { recursive: true, force: true });
        console.log("Session cleared. Restarting...");
        this.initBailey();
    };

    public getMessage = async (key: WAMessageKey): Promise<WAMessageContent | undefined> => {
        const message = await this.store?.loadMessage(key.remoteJid, key.id);
        return message?.message || undefined;
    };

    public sendMessage = async (number: string, text: string): Promise<void> => {
        if (!this.sock) {
            console.error("Socket is not initialized yet.");
            return;
        }
        await this.sock.sendMessage(number, { text });
        console.log(`Message sent to ${number}: ${text}`);
    };

    public sendReply = async (message: WAMessage, text: string): Promise<void> => {
        if (!this.sock) {
            console.error("Socket is not initialized yet.");
            return;
        }
        try {
            await this.sock.sendMessage(message.key.remoteJid!, { text: text }, { quoted: message });
            // await this.sock.sendMessage(message.key.remoteJid!, { text: `${text} @${message.key.participant?.replace('@s.whatsapp.net', '')}`, mentions: [message.key.participant] });
            const groupMetadata = await this.sock.groupMetadata(message.key.remoteJid!);
            const groupName = groupMetadata.subject || '';  // Nama grup
            console.log(`Pesan balasan terkirim ke Group ${groupName} Pada orang ${message.key.participant}: ${text}`);
        } catch (error) {
            console.error("Terjadi kesalahan saat mengirim pesan:", error);
        }
    };

    public sendToChannel = async (channelId: string, text: string): Promise<void> => {
        if (!this.sock) {
            console.error("Socket is not initialized yet.");
            return;
        }

        try {
            // Membangun objek pesan yang akan dikirim
            const msg = { conversation: text }; // Membuat pesan text
            const plaintext = proto.Message.encode(msg).finish(); // Mengencode pesan ke dalam format Protobuf

            // Membuat node untuk pesan tersebut
            const plaintextNode = {
                tag: 'plaintext',
                attrs: {},
                content: plaintext,
            };

            const node = {
                tag: 'message',
                attrs: { to: channelId, type: 'text' }, // Menentukan tujuan dan jenis pesan
                content: [plaintextNode],
            };

            // Mengirim pesan melalui socket dengan format Protobuf
            await this.sock.query(node); // Menggunakan query untuk mengirim pesan
            console.log(`Message sent to channel ${channelId}: ${text}`);
        } catch (error) {
            console.error("Error sending message:", error);
        }
    };

    private listenForMessages() {
        this.sock.ev.on("messages.upsert", async (m: { messages: WAMessage[] }) => {
            const message = m.messages[0];
            if (message && message.message) {
                const isFromBot = message.key.fromMe;  // `fromMe` adalah boolean yang menunjukkan apakah pesan berasal dari bot
                if (isFromBot) {
                    return;  // Mengabaikan pesan dari bot
                }

                const messageText = message.message.conversation?.toLowerCase() || message.message?.extendedTextMessage?.text?.toLowerCase() || '';
                const whatsappNumber = `@${process.env.WHTASPP_NUMBER}`;
                const channelID = `${process.env.CHANNEL_ID}`;
                const botName = `@${process.env.BOT_NAME}`.toLowerCase();
                const isGroup = message.key.remoteJid!.endsWith('@g.us');  // Cek jika pesan berasal dari grup
                const isReplyToBot = message.message.extendedTextMessage?.contextInfo?.participant;

                console.log(`Pesan dari ${message.pushName}: ${messageText}`);

                if (isGroup) {
                    if (whatsappNumber && (messageText.includes(whatsappNumber) || messageText.includes(botName) || isReplyToBot)) {
                        // Mengirim status sedang mengetik'
                        await this.sock.presenceSubscribe(message.key.remoteJid);
                        await this.sock.sendPresenceUpdate("composing", message.key.remoteJid);
                        // const replyText = "Oke";
                        const replyText = await openaiChat(messageText);
                        await this.sendReply(message, replyText!);
                    }
                }
                else {
                    if (messageText.includes("@menfess")) {
                        // Mengirim status sedang mengetik'
                        await this.sock.presenceSubscribe(message.key.remoteJid);
                        await this.sock.sendPresenceUpdate("composing", message.key.remoteJid);

                        setTimeout(async () => {
                            const replyText = "Menfess Telah Terpublish";
                            await this.sendToChannel(channelID, messageText);
                            await this.sendMessage(message.key.remoteJid!, replyText);
                        }, 500); // mengetik selama 0.5 detik
                    }

                    else {
                        // Mengirim status sedang mengetik'
                        await this.sock.presenceSubscribe(message.key.remoteJid);
                        await this.sock.sendPresenceUpdate("composing", message.key.remoteJid);
                        try {
                            // const replyText = "Haloo";
                            const replyText = await openaiChat(messageText);
                            await this.sendMessage(message.key.remoteJid!, replyText!);
                        } catch (error) {
                            console.log("Error:", error);
                        }
                    }
                }
            }
        });
    }
}