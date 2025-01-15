import { Boom } from '@hapi/boom';
import NodeCache from 'node-cache';
import makeWASocket, {
    delay,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    makeInMemoryStore,
    proto,
    useMultiFileAuthState,
    WAMessage,
    WAMessageContent,
    WAMessageKey
} from '@whiskeysockets/baileys';
import P from 'pino';
import dotenv from 'dotenv';
import { useLLM } from './llm';
import { anonymChat, menfessChannel, replayAnonymChat, sendAnonymChat } from './utils/feature';
import { clearAnonymChat } from './conversation/conversationService';

// Mengonfigurasi dotenv untuk memuat variabel lingkungan
dotenv.config();

// Menginisialisasi logger menggunakan Pino
const logger: any = P(
    { timestamp: () => `,"time":"${new Date().toJSON()}"` },
    // P.destination('./wa-logs.txt') // Uncomment jika ingin log ke file
);
logger.level = process.env.LOG_LEVEL || 'info';

// Memeriksa apakah variabel lingkungan diperlukan tersedia
if (!process.env.WHATSAPP_NUMBER) {
    console.error("WHATSAPP_NUMBER is not defined in the environment variables.");
    process.exit(1); // Keluar jika variabel environment tidak ditemukan
}

// Mengatur konfigurasi berdasarkan variabel lingkungan
const useStore = process.env.USE_STORE === 'true';
const usePairingCode = process.env.PAIRING_CODE === 'true';

// Menginisialisasi cache dan peta
const msgRetryCounterCache = new NodeCache();
const onDemandMap = new Map<string, string>();

// Menginisialisasi store jika diperlukan
let store: any;
if (useStore) {
    store = makeInMemoryStore({ logger });
    store.readFromFile('./baileys_store_multi.json');
    // Menyimpan store setiap 10 detik
    setInterval(() => {
        store?.writeToFile('./baileys_store_multi.json');
    }, 10_000);
}

/**
 * Mengirim pesan dengan indikasi sedang mengetik
 * @param sock Instance dari WASocket
 * @param isGroup Indikator apakah pesan dikirim ke grup
 * @param jid ID penerima
 * @param msg Konten pesan yang akan dikirim
 * @param text Teks pesan yang diterima
 */
const sendMessageWTyping = async (
    sock: ReturnType<typeof makeWASocket>,
    isGroup: boolean,
    jid: string,
    msg: WAMessage,
    text: string
) => {
    try {
        await sock.presenceSubscribe(jid);
        await sock.sendPresenceUpdate('composing', jid);

        if (isGroup) {
            const replayText = await useLLM(text);
            const groupMetadata = await sock.groupMetadata(msg.key.remoteJid!);
            const groupName = groupMetadata.subject || '';
            await sock.sendMessage(jid, { text: replayText as string }, { quoted: msg });
            console.log(`Mengirim pesan ke grup ${groupName} : ${replayText}`);
        } else {
            if (text.includes("/menfess")) {
                await menfessChannel(sock, text, jid);
            }
            else if (text.includes("/anonym")) {
                await anonymChat(sock, text, jid);
            }
            else if (text.includes("/balas")) {
                await replayAnonymChat(sock, text, jid);
            }
            else if (text.includes("/send") || text.includes("/sent")) {
                await sendAnonymChat(sock, text, jid);
            }
            else if (text.includes("/clear")) {
                try {
                    await clearAnonymChat(jid);
                    await sock.sendMessage(jid, { text: "_Semua percakapan telah dihapus_" as string });
                    console.log("Berhasil Menghapus Semua Percakapan")
                    console.log(`Membalas pesan ke ${msg.pushName} : _✓ Semua percakapan telah dihapus_`);
                } catch (error) {
                    console.log("Gagal Menghapus Semua Percakapan")
                }
            }
            else {
                const replayText = await useLLM(text);
                await sock.sendMessage(jid, { text: replayText as string });
                console.log(`Mengirim pesan ke ${msg.pushName} : ${replayText}`);
            }
        }
    } catch (error) {
        logger.error(`Error saat mengirim pesan ke ${jid}:`, error);
    }
};

/**
 * Mengekstrak teks dari pesan
 * @param message Pesan WhatsApp
 * @returns Teks pesan dalam huruf kecil atau string kosong
 */
const extractMessageText = (message: any): string => {
    if (!message?.message) {
        return '';
    }
    if (message.message.conversation) {
        return message.message.conversation.toLowerCase();
    } else if (message.message.extendedTextMessage?.text) {
        return message.message.extendedTextMessage.text.toLowerCase();
    } else if (message.message.imageMessage?.caption) {
        return message.message.imageMessage.caption.toLowerCase();
    } else if (message.message.botInvokeMessage?.message?.extendedTextMessage?.text) {
        return message.message.botInvokeMessage.message.extendedTextMessage.text.toLowerCase();
    } else if (message.message.editedMessage?.message?.protocolMessage?.editedMessage?.extendedTextMessage?.text) {
        return message.message.editedMessage.message.protocolMessage.editedMessage.extendedTextMessage.text.toLowerCase();
    }
    // Tambahkan jenis pesan lainnya sesuai kebutuhan
    return '';
};

/**
 * Menangani pembaruan koneksi
 * @param update Data pembaruan koneksi
 * @param sock Instance dari WASocket
 */
const handleConnectionUpdate = async (update: any, sock: ReturnType<typeof makeWASocket>) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        if (shouldReconnect) {
            console.log('Koneksi ditutup. Mencoba menyambung ulang...');
            await WhatsFess(); // Rekoneksi
        } else {
            console.log('Koneksi ditutup. Anda telah logout.');
            process.exit(0); // Keluar jika logout
        }
    }
    else if (connection === 'open') {
        console.log('Whatsapp Berhasil Terhubung!');
    }
};

/**
 * Mendapatkan pesan berdasarkan kunci pesan
 * @param key Kunci pesan
 * @returns Promise<WAMessageContent | undefined> Konten pesan atau undefined
 */
const getMessage = async (key: WAMessageKey): Promise<WAMessageContent | undefined> => {
    if (store) {
        const msg = await store.loadMessage(key.remoteJid!, key.id!);
        return msg?.message || undefined;
    }

    // Hanya jika store ada
    return proto?.Message.fromObject({});
};

/**
 * Menangani event upsert pesan
 * @param upsert Data upsert pesan
 * @param sock Instance dari WASocket
 */
const handleMessagesUpsert = async (upsert: any, sock: ReturnType<typeof makeWASocket>) => {
    if (upsert.type === 'notify') {
        for (const msg of upsert.messages) {
            if (msg.key.fromMe || msg.key.remoteJid.endsWith('@newsletter') || (process.env.NODE_ENV === 'dev' && msg.key.remoteJid !== process.env.WHATSAPP_NUMBER_DEV + '@s.whatsapp.net')) {
                continue; // Lewati pesan dari diri sendiri atau newsletter
            }

            try {
                // Cek jenis e2e sebelum dekripsi
                if (msg.messageStubType && msg.messageStubType === 2) {
                    logger.warn(`Pesan dengan ID ${msg.key.id} memiliki jenis e2e yang tidak dikenali: msmsg`);
                    continue; // Lewati pesan ini
                }

                const remoteJid = msg.key.remoteJid;
                const text = extractMessageText(msg);
                const whatsappNumber = `@${process.env.WHATSAPP_NUMBER}`;
                const botName = `@${process.env.BOT_NAME}`.toLowerCase();
                const isGroup = remoteJid.endsWith('@g.us');
                const isReplyToBot = msg?.message?.extendedTextMessage?.contextInfo?.participant;

                let senderName = msg.pushName;
                if (msg.message?.editedMessage?.message?.protocolMessage?.key?.participant) {
                    senderName = "Meta Ai";
                }

                console.log("Menerima pesan dari ", senderName, ":", text);

                if (isGroup) {
                    // console.log(text.includes(whatsappNumber), text.includes(botName), isReplyToBot)
                    if (whatsappNumber && (text.includes(whatsappNumber) || text.includes(botName) || isReplyToBot === process.env.WHATSAPP_NUMBER + '@s.whatsapp.net')) {
                        await sock.readMessages([msg.key]);
                        await sendMessageWTyping(sock, true, remoteJid, msg, text);
                    }
                } else {
                    await sock.readMessages([msg.key]);
                    await sendMessageWTyping(sock, false, remoteJid, msg, text);
                }
            } catch (error) {
                logger.error(`Gagal memproses pesan dengan ID ${msg.key.id}:`, error);
                // Anda bisa menambahkan logika tambahan di sini, misalnya mengabaikan pesan atau mencoba tindakan lain
            }
        }
    }
};

/**
 * Memulai koneksi WhatsApp
 */
export const WhatsFess = async () => {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`Menggunakan WA v${version.join('.')}, isLatest: ${isLatest}`);

        const sock = makeWASocket({
            version,
            logger,
            printQRInTerminal: !usePairingCode,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            msgRetryCounterCache: msgRetryCounterCache,
            generateHighQualityLinkPreview: true,
            getMessage: getMessage,
        });

        // Bind store ke event jika digunakan
        if (store) {
            store.bind(sock.ev);
        }

        // Menangani kode pairing untuk klien web
        if (usePairingCode && !sock.authState.creds.registered) {
            console.log("Mengambil Kode Pairing...");
            const whatsappNumber = String(process.env.WHATSAPP_NUMBER);
            await delay(6000);
            const code = await sock.requestPairingCode(whatsappNumber);
            console.log(`Kode Pairing: ${code}`);
        }

        console.log("Menghubungkan ke Whatsapp...");

        // Proses semua event yang diterima
        sock.ev.process(async (events) => {
            if (events['connection.update']) {
                await handleConnectionUpdate(events['connection.update'], sock);
            }

            if (events['creds.update']) {
                await saveCreds();
            }

            if (events['messages.upsert']) {
                await handleMessagesUpsert(events['messages.upsert'], sock);
            }
        });

        return sock;
    } catch (error) {
        logger.error('Error saat memulai koneksi:', error);
        throw error;
    }
};
