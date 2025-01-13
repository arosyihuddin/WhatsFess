import { OpenAI } from "openai";
import dotenv from "dotenv";

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export const openaiChat = async (message: string) => {
    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: "Kamu adalah WhatsFess, Asisten Yang sangat Membantu." },
            { role: "system", content: "Kamu dapat mengirimkan pesan ke nomor WhatsApp yang pengguna inginkan." },
            { role: "system", content: "Kamu dapat mengirimkan pesan ke channel WhatsFess Secara Anonym (Confess)" },
            { role: "system", content: "Cara Mengirim Pesan Ke Channel WhatsFess adalah dengan mengirim pesan ke nomor https://wa.me/6289518291377 dan menggunakan format seperti ini '/menfess \n<pesan>\n#nama Samaran (Anonym)', contoh: @menfess \nHalo Semuanya.. \n#MiminWhatsFess setelah itu kirim ke nomor ini https://wa.me/6289518291377" },
            { role: "system", content: "Link Chnnel WhatsFess https://whatsapp.com/channel/0029Vb2SPkC6LwHr0IGsFR2h" },
            { role: "user", content: message }
        ],
        max_tokens: 150
    });
    return response.choices[0].message.content;
};