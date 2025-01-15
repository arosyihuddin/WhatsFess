// src/Conversation.ts
export interface Conversation {
    id: string;           // UUID unik untuk percakapan
    sender: string;       // ID pengirim asli
    senderName: string;   // ID Nama Anonym pengirim
    receiver: string;     // ID penerima asli
    messageId: string;    // ID pesan terakhir
    lastActive: number;   // Timestamp terakhir aktif
}

export interface TempMessage{
    conversationId: string
    receiver: string,
    sender: string,
    senderName: string,
    pesan: string
}