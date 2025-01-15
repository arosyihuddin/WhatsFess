import makeWASocket, { proto } from "@whiskeysockets/baileys";
import { v4 as uuidv4 } from 'uuid';
import { parseMessage } from "./helper";
import { addConversationToSets, deleteTempMessage, findReceiverConveration, findSenderConversation, getTempMessage, removeConversationFromSets, saveConversation, saveTempMessage } from "../conversation/conversationService";
import { Conversation } from "../conversation/Conversation";

export const anonymChat = async (sock: ReturnType<typeof makeWASocket>, message: string, senderId: string) => {
    message = message.replace("/anonym", "").trim();
    const { receiver, sender, pesan, argument } = await parseMessage(message, senderId);
    const converation = await findSenderConversation(senderId);
    if (!argument) {
        if (!converation) {
            if ((!sender || !receiver || !pesan)) {
                console.log(`Membalas Pesan Ke ${senderId}: Format pesan tidak valid`);
                const alertFormat = "_Format pesan tidak valid_\n\nGunakan Template berikut:\n\n/anonym\n\nto: 62856xxxxxxx\nfrom: Penggemarmu\n\npesan: aku sebenarnya suka kamu🫣";
                await sock.sendMessage(senderId, { text: alertFormat })
                return;
            }
            else if (!receiver.startsWith('62')) {
                console.log(`Membalas Pesan Ke ${senderId}: Nomor ${receiver} tidak valid`);
                const alertFormat = "_Nomor tujuan tidak valid. Gunakan awalan 62_\n\nGunakan Template berikut:\n\n/anonym\n\nto: 62856xxxxxxx\nfrom: Penggemarmu\n\npesan: aku sebenarnya suka kamu🫣";
                await sock.sendMessage(senderId, { text: alertFormat })
                return;
            }
            // else if (senderId === receiver) {
            //     console.log(`Membalas Pesan Ke ${senderId}: Nomor tujuan tidak boleh nomor sendiri!`);
            //     const alertFormat = "_Nomor tujuan tidak boleh nomor sendiri!!_";
            //     await sock.sendMessage(senderId, { text: alertFormat })
            //     return;
            // }

            try {
                const forawardMessage = `_WhatsFess AnonymChat_\n*From: ${sender}*\n\nPesan:\n${pesan}\n\n_Silakan gunakan command \`/balas\` untuk membalas pesan_\nContoh :\n\`/balas Hai, apa kabar?\`\n\n_⌛ Percakapan akan terhapus dalam 2 jam_`;
                const sendChat = await sock.sendMessage(receiver, { text: forawardMessage })
                const messageId = sendChat?.key.id
                const conversationId = uuidv4();
                const conv = {
                    id: conversationId,
                    sender: senderId,
                    senderName: sender,
                    receiver,
                    messageId: messageId!,
                    lastActive: Date.now(),
                };
                await saveConversation(conv);
                await addConversationToSets(conv);
                console.log(`Membalas pesan Anonym dari ${senderId} ke ${receiver}: ${pesan}`);
                await sock.sendMessage(senderId, { text: `_✓ Pesan telah terkirim ke nomor ${receiver.replace("@s.whatsapp.net", "").trim()}!🤗_\npercakapan selanjutnya gunakan command \`/send\` <pesan>\n\n_⏳ Percakapan akan terhapus dalam 2 jam_` })
                return
            } catch (error) {
                console.log("Gagal mengirim pesan anonym. Error", error);
                await sock.sendMessage(senderId, { text: "_Gagal mengirim pesan, coba lagi nanti_" })
            }
        }
        else {
            if ((!sender || !receiver || !pesan)) {
                console.log(`Membalas Pesan Ke ${senderId}: Format pesan tidak valid`);
                const alertFormat = "_Format pesan tidak valid_\n\nGunakan Template berikut:\n\n/anonym\n\nto: 62856xxxxxxx\nfrom: Penggemarmu\n\npesan: aku sebenarnya suka kamu🫣";
                await sock.sendMessage(senderId, { text: alertFormat })
                return;
            }
            else if (!receiver.startsWith('62')) {
                console.log(`Membalas Pesan Ke ${senderId}: Nomor ${receiver} tidak valid`);
                const alertFormat = "_Nomor tujuan tidak valid. Gunakan awalan 62_\n\nGunakan Template berikut:\n\n/anonym\n\nto: 62856xxxxxxx\nfrom: Penggemarmu\n\npesan: aku sebenarnya suka kamu🫣";
                await sock.sendMessage(senderId, { text: alertFormat })
                return;
            }
            // else if (senderId === receiver) {
            //     console.log(`Membalas Pesan Ke ${senderId}: Nomor tujuan tidak boleh nomor sendiri!`);
            //     const alertFormat = "_Nomor tujuan tidak boleh nomor sendiri!!_";
            //     await sock.sendMessage(senderId, { text: alertFormat })
            //     return;
            // }
            if (converation.receiver === receiver) {
                await sock.sendMessage(senderId, { text: `_Percakapan dengan nomor tujuan ${converation.receiver.replace("@s.whatsapp.net", "")} telah tersimpan_\n\n_Silakan gunakan command \`/send\` untuk membalas pesan_\nContoh :\n\`/send Hai, apa kabar?\`` })
                return;
            }
            else {
                console.log(`Membalas Pesan Ke ${senderId}: Terdapat 1 percakapan aktif!`);
                const alertFormat = "_Anda sudah memiliki 1 percakapan, jika anda membuat percakapan baru percakapan sebelumnya akan dihapus, jika anda yakin kirimkan pesan `/anonym ya`\n\n⚠️Warning:\n_Jika percakapan dihapus, maka nomor tujuan tidak dapat membalas pesan anda_";
                await sock.sendMessage(senderId, { text: alertFormat })
                const tempChat = {
                    conversationId: uuidv4(),
                    receiver: receiver,
                    sender: senderId,
                    senderName: sender,
                    pesan: pesan
                }
                await saveTempMessage(senderId, tempChat)
                return;

            }
        }
    }
    else {
        const tempMessage = await getTempMessage(senderId);
        if (tempMessage) {
            const forawardMessage = `_WhatsFess AnonymChat_\n*From: ${tempMessage?.senderName}*\n\nPesan:\n${tempMessage?.pesan}\n\n_Silakan gunakan command \`/balas\` untuk membalas pesan_\nContoh :\n\`/balas Hai, apa kabar?\`\n\n_⌛ Percakapan akan terhapus dalam 2 jam_`;
            try {
                await sock.sendMessage(tempMessage.receiver, { text: forawardMessage })
                console.log(`Membalas pesan Anonym dari ${senderId} ke ${tempMessage?.receiver}: ${tempMessage?.pesan}`);
                const sendChat = await sock.sendMessage(senderId, { text: `_✓ Pesan telah terkirim ke nomor ${tempMessage?.receiver.replace("@s.whatsapp.net", "").trim()}!🤗_\npercakapan selanjutnya gunakan command \`/send\` <pesan>\n\n_⏳ Percakapan akan terhapus dalam 2 jam_` })
                await removeConversationFromSets(converation!);
                await deleteTempMessage(senderId);
                const tempConv: Conversation = {
                    id: tempMessage!.conversationId,
                    receiver: tempMessage!.receiver,
                    sender: tempMessage!.sender,
                    senderName: tempMessage!.senderName,
                    messageId: sendChat!.key.id!,
                    lastActive: new Date().getTime()
                }
                await saveConversation(tempConv);
                await addConversationToSets(tempConv);
                return
            } catch (error) {
                await sock.sendMessage(senderId, { text: "_Gagal mengirim pesan, coba lagi nanti_" })
                return
            }
        }
    }
};

export const replayAnonymChat = async (sock: ReturnType<typeof makeWASocket>, message: string, jid: string) => {
    message = message.replace("/balas", "").trim();

    try {
        const conversation = await findReceiverConveration(jid)
        if (!conversation) {
            await sock.sendMessage(jid, { text: "_Anda belum membuat percakapan._\n\nSilakan gunakan command \`/anonym\` untuk membuat percakapan baru" })
            return
        }

        const forawardMessage = `*From: ${conversation.receiver.replace("@s.whatsapp.net", "").trim()}*\n\nPesan:\n${message}`;
        await sock.sendMessage(conversation?.sender, { text: forawardMessage })
        await sock.sendMessage(jid, { text: "_✓ Pesan Terkirim!🤗_" })
        console.log(`Membalas pesan Anonym dari ${jid} ke ${conversation?.sender}: ${message}`);
    } catch (error) {
        console.log("Gagal mengirim pesan anonym. Error", error);
        await sock.sendMessage(jid, { text: "_Gagal mengirim pesan, coba lagi nanti_" })
    }
}
export const sendAnonymChat = async (sock: ReturnType<typeof makeWASocket>, message: string, jid: string) => {
    message = message.replace("/send", "").replace("/sent", "").trim();
    const { receiver, sender, pesan, argument } = await parseMessage(message, jid);

    try {
        const conversation = await findSenderConversation(jid)
        if (!conversation) {
            await sock.sendMessage(jid, { text: "_Percakapan tidak tersedia_\n\nSilakan gunakan command \`/anonym\` untuk membuat percakapan baru" })
            return
        }

        const forawardMessage = `*From: ${conversation.senderName}*\nPesan:\n${pesan ? pesan : message}`;
        await sock.sendMessage(conversation.receiver, { text: forawardMessage })
        await sock.sendMessage(jid, { text: "_✓ Pesan Terkirim!🤗_" })
        console.log(`Membalas pesan Anonym dari ${jid} ke ${conversation.receiver}: ${pesan ? pesan : message}`);
    } catch (error) {
        console.log("Gagal mengirim pesan anonym. Error", error);
        await sock.sendMessage(jid, { text: "_Gagal mengirim pesan, coba lagi nanti_" })
    }
}

export const menfessChannel = async (sock: ReturnType<typeof makeWASocket>, message: string, jid: string) => {
    const channelId = `${process.env.CHANNEL_ID}`;
    message = message.replace("/menfess", "").trim();
    try {
        // Membangun objek pesan yang akan dikirim
        const objMessage = { conversation: message }; // Membuat pesan message
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
        console.log(`Mengirim pesan ke channel: ${message}`);
        await sock.sendMessage(jid, { text: "_*Pesanmu telah dikirim ke Saluran Menfess WhatsFess*_\n\nSilahkan Kunjungi Saluran melalui link berikut:\nhttps://whatsapp.com/channel/0029Vb2SPkC6LwHr0IGsFR2h" })
    } catch (error) {
        await sock.sendMessage(jid, { text: "Maaf, server sedang sibuk, silahkan coba beberapa saat lagi" })
        console.error("Error sending message:", error);
    }
}

