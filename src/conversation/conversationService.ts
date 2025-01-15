// src/ConversationService.ts
import { Conversation, TempMessage } from './Conversation';
import redis from '../utils/redisClient';

// Prefix untuk key Redis
const CONVERSATION_PREFIX = 'conversation:';

// Fungsi untuk membuat key Redis
const getConversationKey = (id: string) => `${CONVERSATION_PREFIX}${id}`;

// Fungsi untuk menyimpan percakapan
export async function saveConversation(conversation: Conversation): Promise<void> {
    const key = getConversationKey(conversation.id);
    await redis.hmset(key, {
        id: conversation.id,
        sender: conversation.sender,
        senderName: conversation.senderName,
        receiver: conversation.receiver,
        messageId: conversation.messageId,
        lastActive: conversation.lastActive,
    });

    // Set expiration time jika diperlukan, misalnya 24 jam
    await redis.expire(key, 7200);
}

// Fungsi untuk mengambil percakapan berdasarkan ID
export async function getConversation(id: string): Promise<Conversation | null> {
    const key = getConversationKey(id);
    const data = await redis.hgetall(key);
    if (Object.keys(data).length === 0) return null;
    return {
        id: data.id,
        sender: data.sender,
        senderName: data.senderName,
        receiver: data.receiver,
        messageId: data.messageId,
        lastActive: parseInt(data.lastActive, 10),
    };
}

// Fungsi untuk mencari percakapan berdasarkan sender dan receiver
export async function findConversation(sender: string, receiver: string): Promise<Conversation | null> {
    // Asumsi bahwa Anda menyimpan ID percakapan dalam Set terpisah untuk sender dan receiver
    const senderSetKey = `sender:${sender}`;
    const receiverSetKey = `receiver:${receiver}`;

    // Mendapatkan intersection antara kedua Set
    const conversationIds = await redis.sinter(senderSetKey, receiverSetKey);

    for (const id of conversationIds) {
        const convo = await getConversation(id);
        if (convo) return convo;
    }
    return null;
}

// Fungi untuk mencari user dalam percakapan
export async function findUserOnConversation(sender: string): Promise<Conversation[] | null> {
    const conversationIds = await redis.sunion(`sender:${sender}`, `receiver:${sender}`)
    // Jika tidak ada percakapan ditemukan, kembalikan null
    if (conversationIds.length === 0) {
        return null;
    }
    // Array untuk menyimpan percakapan yang ditemukan
    const conv: Conversation[] = [];

    // Loop untuk mendapatkan data percakapan berdasarkan ID
    for (const id of conversationIds) {
        const conversation = await getConversation(id);

        // Pastikan percakapan ditemukan sebelum menambahkannya ke array
        if (conversation) {
            conv.push(conversation);
        }
    }

    // Kembalikan array percakapan yang ditemukan
    return conv;
}

// Fungi untuk mencari user sebagai sender
export async function findSenderConversation(sender: string): Promise<Conversation | null> {
    const conversationIds = await redis.sinter(`sender:${sender}`)
    // const conversationIds = await redis.sinter(`sender:${sender}`) || redis.sinter(`receiver:${sender}`)
    for (const id of conversationIds) {
        const convo = await getConversation(id);
        if (convo) return convo;
    }
    return null;
}

// Fungi untuk mencari data nomor yang dituju berdasarkan sender
export async function findReceiverConveration(sender: string): Promise<Conversation | null> {
    const conversationIds = await redis.sinter(`receiver:${sender}`)
    for (const id of conversationIds) {
        const convo = await getConversation(id);
        if (convo) return convo;
    }
    return null;
}

// Fungsi untuk menambahkan percakapan ke Set sender dan receiver
export async function addConversationToSets(conversation: Conversation): Promise<void> {
    const senderSetKey = `sender:${conversation.sender}`;
    const receiverSetKey = `receiver:${conversation.receiver}`;

    await redis.sadd(senderSetKey, conversation.id);
    await redis.sadd(receiverSetKey, conversation.id);
    await redis.expire(senderSetKey, 7200);
    await redis.expire(receiverSetKey, 7200);
}

// Fungsi untuk menghapus percakapan dari Set sender dan receiver
export async function removeConversationFromSets(conversation: Conversation): Promise<void> {
    const senderSetKey = `sender:${conversation.sender}`;
    const receiverSetKey = `receiver:${conversation.receiver}`;
    const convSetKey = `conversation:${conversation.id}`

    await redis.del(convSetKey);
    await redis.srem(senderSetKey, conversation.id);
    await redis.srem(receiverSetKey, conversation.id);
}

// Fungsi untuk menyimpan pesan sementara untuk menunggu konfirmasi dikirimkan
export async function saveTempMessage(senderId: string, message: TempMessage): Promise<void> {
    const key = `tempMessage:${senderId}`;
    // await redis.set(key, JSON.stringify(message));
    await redis.hmset(key, message);
    await redis.expire(key, 3600)
}

// Fungsi untuk mengambil pesan sementara
export async function getTempMessage(senderId: string): Promise<TempMessage | null> {
    const key = `tempMessage:${senderId}`;
    const data = await redis.hgetall(key);
    if (Object.keys(data).length === 0) return null;
    return {
        conversationId: data.conversationId,
        receiver: data.receiver,
        sender: data.sender,
        senderName: data.senderName,
        pesan: data.pesan
    };
}

// Fungsi untuk menghapus pesan sementara
export async function deleteTempMessage(senderId: string): Promise<void> {
    const key = `tempMessage:${senderId}`;
    await redis.del(key);
}

// Fungsi untuk clear anonymchat
export async function clearAnonymChat(senderId: string): Promise<void> {
    const conversationIds = await findUserOnConversation(senderId)
    // Memastikan data percakapan ada dan bukan null atau array kosong
    if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
        console.log("No conversations found for the sender.");
        return;
    }

    // Iterasi untuk menghapus setiap percakapan
    for (const conv of conversationIds) {
        // Menghapus percakapan dari Redis
        await removeConversationFromSets(conv);  // Tunggu penghapusan selesai
    }
}