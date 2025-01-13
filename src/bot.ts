import { Boom } from '@hapi/boom'
import NodeCache from 'node-cache'
import readline from 'readline'
import makeWASocket, {
    delay,
    DisconnectReason,
    fetchLatestBaileysVersion,
    getAggregateVotesInPollMessage,
    makeCacheableSignalKeyStore,
    makeInMemoryStore,
    proto,
    useMultiFileAuthState,
    WAMessage,
    WAMessageContent,
    WAMessageKey
} from '@whiskeysockets/baileys'
import P from 'pino'
import dotenv from 'dotenv'
import { openaiChat } from './openai'
import { sleep } from 'openai/core'
dotenv.config()

export class WhatsFess {
    private logger: any
    private useStore: boolean
    private usePairingCode: boolean
    private msgRetryCounterCache: NodeCache
    private onDemandMap: Map<string, string>
    private rl: readline.Interface
    private store?: ReturnType<typeof makeInMemoryStore>

    constructor() {
        // Inisialisasi logger
        this.logger = P(
            { timestamp: () => `,"time":"${new Date().toJSON()}"` },
            // P.destination('./wa-logs.txt')
        ) as any
        this.logger.level = process.env.LOG_LEVEL || 'info'
        if (!process.env.WHATSAPP_NUMBER || !process.env.PAIRING_CODE) {
            console.error("WHATSAPP_NUMBER OR PAIRING_CODE is not defined in the environment variables.");
            process.exit(1);  // Keluar jika variabel environment tidak ditemukan
        }

        // Konfigurasi berdasarkan argumen baris perintah
        this.useStore = !process.argv.includes('--no-store')
        this.usePairingCode = process.env.PAIRING_CODE === 'true'

        // Inisialisasi cache dan peta
        this.msgRetryCounterCache = new NodeCache()
        this.onDemandMap = new Map<string, string>()

        // Inisialisasi antarmuka baris perintah
        this.rl = readline.createInterface({ input: process.stdin, output: process.stdout })

        // Inisialisasi store jika diperlukan
        if (this.useStore) {
            this.store = makeInMemoryStore({ logger: this.logger })
            this.store.readFromFile('./baileys_store_multi.json')
            // Simpan store setiap 10 detik
            setInterval(() => {
                this.store?.writeToFile('./baileys_store_multi.json')
            }, 10_000)
        }
    }

    /**
     * Fungsi pembantu untuk mendapatkan input dari pengguna
     * @param text Teks pertanyaan
     * @returns Promise<string> Jawaban dari pengguna
     */
    private question(text: string): Promise<string> {
        return new Promise<string>((resolve) => this.rl.question(text, resolve))
    }

    /**
     * Mengirim pesan dengan indikasi sedang mengetik
     * @param sock Instance dari WASocket
     * @param msg Konten pesan yang akan dikirim
     * @param jid ID penerima
     */
    private async sendMessageWTyping(sock: ReturnType<typeof makeWASocket>, isGroup: boolean, jid: string, msg: WAMessage, text: string) {
        const channelId = `${process.env.CHANNEL_ID}`;
        console.log((channelId))
        await sock.presenceSubscribe(jid)
        await sock.sendPresenceUpdate('composing', jid)
        const replayText = "await openaiChat(text)"
        // const replayText = await openaiChat(text)
        if (isGroup) {
            const groupMetadata = await sock.groupMetadata(msg.key.remoteJid!);
            const groupName = groupMetadata.subject || '';
            await sock.sendMessage(jid, { text: replayText as string }, { quoted: msg })
            console.log(`Mengirim pesan ke grup ${groupName} : ${replayText}`);
        } else {
            if (text.includes("@menfess")) {
                text = text.replace("@menfess", "");
                try {
                    // Membangun objek pesan yang akan dikirim
                    const objMessage = { conversation: text }; // Membuat pesan text
                    const plaintext = proto.Message.encode(objMessage).finish(); // Mengencode pesan ke dalam format Protobuf

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
                    await sock.query(node); // Menggunakan query untuk mengirim pesan
                    console.log(`Mengirim pesan ke channel: ${text}`);
                } catch (error) {
                    console.error("Error sending message:", error);
                }
                await sock.sendMessage(jid, { text: "_*Pesanmu telah dikirim ke Saluran Menfess WhatsFess*_\n\nSilahkan Kunjungi Saluran melalui link berikut:\nhttps://whatsapp.com/channel/0029Vb2SPkC6LwHr0IGsFR2h" })
            }
            else {
                await sock.sendMessage(jid, { text: replayText as string })
                console.log(`Mengirim pesan ke ${msg.pushName} : ${replayText}`);
            }
        }

    }

    /**
     * Memulai koneksi WhatsApp
     */
    public async startSock() {
        try {
            const { state, saveCreds } = await useMultiFileAuthState('auth_info')
            const { version, isLatest } = await fetchLatestBaileysVersion()
            console.log(`Menggunakan WA v${version.join('.')}, isLatest: ${isLatest}`)

            const sock = makeWASocket({
                version,
                logger: this.logger,
                printQRInTerminal: !this.usePairingCode,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, this.logger),
                },
                msgRetryCounterCache: this.msgRetryCounterCache,
                generateHighQualityLinkPreview: true,
                getMessage: this.getMessage.bind(this),
            })

            // Bind store ke event jika digunakan
            if (this.store) {
                this.store.bind(sock.ev)
            }

            // Menangani kode pairing untuk klien web
            if (this.usePairingCode && !sock.authState.creds.registered) {
                // const phoneNumber = await this.question('Silakan masukkan nomor telepon Anda:\n')
                console.log("Mengambil Kode Pairing...")
                // const whatsappNumber = String(process.env.WHATSAPP_NUMBER) || '6289518291377';
                // console.log(whatsappNumber === '6289518291377')
                const whatsappNumber = '6289518291377';
                // const code = await sock.requestPairingCode(phoneNumber)
                const code = await sock.requestPairingCode(whatsappNumber)
                console.log(`Kode Pairing: ${code}`)
            }

            console.log("Menghubungkan ke Whatsapp...")

            // Proses semua event yang diterima
            sock.ev.process(async (events) => {
                if (events['connection.update']) {
                    this.handleConnectionUpdate(events['connection.update'], sock)
                }

                if (events['creds.update']) {
                    await saveCreds()
                }

                if (events['messages.upsert']) {
                    await this.handleMessagesUpsert(events['messages.upsert'], sock)
                }

                // if (events['messaging-history.set']) {
                //     this.handleMessagingHistorySet(events['messaging-history.set'])
                // }

                // if (events['messages.update']) {
                //     this.handleMessagesUpdate(events['messages.update'], sock)
                // }

                // if (events['contacts.update']) {
                //     await this.handleContactsUpdate(events['contacts.update'], sock)
                // }

                // if (events['labels.association']) {
                //     console.log(events['labels.association'])
                // }

                // if (events['labels.edit']) {
                //     console.log(events['labels.edit'])
                // }

                // if (events.call) {
                //     console.log('Menerima event panggilan', events.call)
                // }

                // if (events['message-receipt.update']) {
                //     console.log(events['message-receipt.update'])
                // }

                // if (events['messages.reaction']) {
                //     console.log(events['messages.reaction'])
                // }

                // if (events['presence.update']) {
                //     console.log(events['presence.update'])
                // }

                // if (events['chats.update']) {
                //     console.log(events['chats.update'])
                // }


                // if (events['chats.delete']) {
                //     console.log('Chats dihapus ', events['chats.delete'])
                // }
            })

            return sock
        } catch (error) {
            this.logger.error('Error saat memulai koneksi:', error)
            throw error
        }
    }

    /**
     * Menangani pembaruan koneksi
     * @param update Data pembaruan koneksi
     * @param sock Instance dari WASocket
     */
    private async handleConnectionUpdate(update: any, sock: ReturnType<typeof makeWASocket>) {
        const { connection, lastDisconnect } = update
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut
            if (shouldReconnect) {
                console.log('Koneksi ditutup. Mencoba menyambung ulang...')
                await this.startSock()
            } else {
                console.log('Koneksi ditutup. Anda telah logout.')
            }
        }
        else if (connection === 'open') {
            console.log('Whatsapp Berhasil Terhubung!')
        }

        // console.log('Pembaruan koneksi:', update)
    }

    /**
     * Menangani pembaruan riwayat pesan
     * @param historyData Data riwayat pesan
     */
    private handleMessagingHistorySet(historyData: any) {
        const { chats, contacts, messages, isLatest, progress, syncType } = historyData
        if (syncType === proto.HistorySync.HistorySyncType.ON_DEMAND) {
            console.log('Menerima sinkronisasi riwayat on-demand, pesan=', messages)
        }
        console.log(`Menerima ${chats.length} chats, ${contacts.length} kontak, ${messages.length} pesan (is latest: ${isLatest}, progress: ${progress}%), type: ${syncType}`)
    }

    /**
     * Menangani event upsert pesan
     * @param upsert Data upsert pesan
     * @param sock Instance dari WASocket
     */
    private async handleMessagesUpsert(upsert: any, sock: ReturnType<typeof makeWASocket>) {
        // console.log('Menerima pesan:', upsert)
        if (upsert.type === 'notify') {
            for (const msg of upsert.messages) {
                if (msg.key.fromMe) {
                    return
                }
                const remoteJid = msg.key.remoteJid

                // Menangani pesan dengan konten teks
                const text = this.extractMessageText(msg)
                // if (text.includes("13135550002")) return

                const whatsappNumber = `@${process.env.WHATSAPP_NUMBER}`;
                const botName = `@${process.env.BOT_NAME}`.toLowerCase();
                const isGroup = remoteJid.endsWith('@g.us');
                const isReplyToBot = msg?.message?.extendedTextMessage?.contextInfo?.participant;
                console.log("Menerima pesan dari ", msg.pushName, ":", text)

                if (isGroup) {
                    if (whatsappNumber && (text.includes(whatsappNumber) || text.includes(botName) || isReplyToBot)) {
                        // Mengirim status sedang mengetik'
                        await sock.readMessages([msg.key])
                        await this.sendMessageWTyping(sock, true, remoteJid, msg, text)
                    }
                }

                else {
                    await sock.readMessages([msg.key])
                    await this.sendMessageWTyping(sock, false, remoteJid, msg, text)
                }
            }
        }
    }

    /**
     * Menangani pembaruan pesan
     * @param updates Data pembaruan pesan
     * @param sock Instance dari WASocket
     */
    private async handleMessagesUpdate(updates: any[], sock: ReturnType<typeof makeWASocket>) {
        // console.log(JSON.stringify(updates, undefined, 2))

        for (const { key, update } of updates) {
            if (update.pollUpdates) {
                const pollCreation = await this.getMessage(key)
                if (pollCreation) {
                    console.log(
                        'Pembaruan polling, agregasi: ',
                        getAggregateVotesInPollMessage({
                            message: pollCreation,
                            pollUpdates: update.pollUpdates,
                        })
                    )
                }
            }
        }
    }

    /**
     * Menangani pembaruan kontak
     * @param contacts Data pembaruan kontak
     * @param sock Instance dari WASocket
     */
    private async handleContactsUpdate(contacts: any[], sock: ReturnType<typeof makeWASocket>) {
        for (const contact of contacts) {
            if (typeof contact.imgUrl !== 'undefined') {
                const newUrl = contact.imgUrl === null
                    ? null
                    : await sock.profilePictureUrl(contact.id!).catch(() => null)
                console.log(
                    `Kontak ${contact.id} memiliki foto profil baru: ${newUrl}`,
                )
            }
        }
    }

    /**
     * Mendapatkan pesan berdasarkan kunci pesan
     * @param key Kunci pesan
     * @returns Promise<WAMessageContent | undefined> Konten pesan atau undefined
     */
    private async getMessage(key: WAMessageKey): Promise<WAMessageContent | undefined> {
        if (this.store) {
            const msg = await this.store.loadMessage(key.remoteJid!, key.id!)
            return msg?.message || undefined
        }

        // Hanya jika store ada
        return proto?.Message.fromObject({})
    }

    private extractMessageText(message: any): string {
        if (!message?.message) {
            return '';
        }
        if (message?.message.conversation) {
            return message?.message.conversation.toLowerCase();
        } else if (message?.message?.extendedTextMessage?.text) {
            return message?.message?.extendedTextMessage.text.toLowerCase();
        } else if (message?.message.imageMessage?.caption) {
            return message?.message.imageMessage.caption.toLowerCase();
        } else if (message?.message.botInvokeMessage.message.extendedTextMessage.text) {
            return message?.message.botInvokeMessage.message.extendedTextMessage.text.toLowerCase();
        } else if (message?.message?.editedMessage?.message?.protocolMessage?.editedMessage?.extendedTextMessage?.text) {
            return message?.message?.editedMessage?.message?.protocolMessage?.editedMessage?.extendedTextMessage?.text.toLowerCase();
        }
        // Tambahkan jenis pesan lainnya sesuai kebutuhan
        return '';
    }


}