import { getTempMessage } from "../conversation/conversationService";

// Fungsi untuk mengekstrak komponen dengan regex yang fleksibel
export async function parseMessage(message: string, senderId: string) {
    // Normalisasi karakter baris baru (opsional)
    const normalizedMessage = message.replace(/\r\n/g, '\n');
    
    // Ekstraksi Receiver (To)
    const receiverMatch = normalizedMessage.match(/to\s*:\s*(\d+)/i);
    const receiver = receiverMatch ? `${receiverMatch[1].trim()}@s.whatsapp.net` : undefined;
    
    // Ekstraksi Sender (From)
    const senderMatch = normalizedMessage.match(/from\s*:\s*(.+)/i);
    const sender = senderMatch ? senderMatch[1].trim() : undefined;

    // Ekstraksi Pesan
    const pesanMatch = normalizedMessage.match(/pesan\s*:\s*([\s\S]+)/i);
    const pesan = pesanMatch ? pesanMatch[1].trim() : undefined;

    // return { receiver, sender, pesan };

    // Ekstraksi Command dan Argumen
    const getTempChat = await getTempMessage(senderId)
    if (!getTempChat) return { receiver, sender, pesan };

    let argument: string | undefined = normalizedMessage;
    const validArgument: string[] = ['y', 'ya', 'yaa', 'iya', 'iyh', 'yes', 'iyaa'];

    if (!validArgument.includes(argument)) {
        // Jika perintah atau argumen tidak valid, reset nilai
        argument = undefined;
    }

    return { receiver, sender, pesan, argument };
}