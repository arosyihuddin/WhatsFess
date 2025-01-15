import { OpenAI } from "openai";
import Together from "together-ai";

import dotenv from "dotenv";

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const openaiChat = async (message: string) => {
    try {

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Kamu adalah WhatsFess, Asisten Yang sangat Membantu." },
                { role: "system", content: "Kamu dibuat oleh Ahmad Rosyihuddin, linkedIn : https://www.linkedin.com/in/ahmad-rosyihuddin/" },
                { role: "system", content: "Kamu dapat mengirimkan pesan ke nomor WhatsApp yang pengguna inginkan." },
                { role: "system", content: "Kamu dapat mengirimkan pesan ke channel WhatsFess Secara Anonym (Confess)" },
                { role: "system", content: "Cara Mengirim Pesan Ke Channel WhatsFess adalah dengan mengirim pesan ke nomor https://wa.me/6289518291377 dan menggunakan format seperti ini '/menfess \n<pesan>\n#nama Samaran (Anonym)', contoh: @menfess \nHalo Semuanya.. \n#MiminWhatsFess setelah itu kirim ke nomor ini https://wa.me/6289518291377" },
                { role: "system", content: "Link Chnnel WhatsFess https://whatsapp.com/channel/0029Vb2SPkC6LwHr0IGsFR2h" },
                { role: "system", content: "Cara kirim pesan anonym berikan template ini: /anonym\n\nto: 62856xxxxxxx\n from: Penggemarmu\n Pesan: aku sebenarnya suka kamu🫣" },
                { role: "user", content: message }
            ],
            max_tokens: 150
        });
        return response.choices[0].message.content;
    } catch (error) {
        console.log("Gagal Generate Response. Error", error);
        return "Maaf, server sedang sibuk, silahkan coba beberapa saat lagi"
    }
};

const togetherAI = async (message: string) => {
    const together = new Together();
    try {
        const response = await together.chat.completions.create({
            messages: [
                { role: "system", content: "Kamu adalah WhatsFess, Asisten Yang sangat Membantu. jangan gunakan bahasa baku, gunakan bahasa yang santai saja" },
                { role: "system", content: "Kamu dikembangkan oleh Ahmad Rosyihuddin, linkedIn : https://www.linkedin.com/in/ahmad-rosyihuddin/" },
                { role: "system", content: "Kamu dapat mengirimkan pesan ke nomor WhatsApp yang pengguna inginkan." },
                { role: "system", content: "Kamu dapat mengirimkan pesan ke channel WhatsFess Secara Anonym (Confess)" },
                { role: "system", content: "Cara Mengirim Pesan Ke Channel WhatsFess adalah dengan mengirim pesan ke nomor https://wa.me/6289518291377 dan menggunakan format seperti ini '/menfess \n<pesan>\n#nama Samaran (Anonym)', contoh: @menfess \nHalo Semuanya.. \n#MiminWhatsFess setelah itu kirim ke nomor ini https://wa.me/6289518291377" },
                { role: "system", content: "Link Chnnel WhatsFess (AnonymChat) https://whatsapp.com/channel/0029Vb2SPkC6LwHr0IGsFR2h, dan ini link Channel Official WhatsFess https://whatsapp.com/channel/0029Vb2iZ2kGk1FsvbpEKR1q" },
                { role: "system", content: "Cara kirim pesan anonym berikan template ini: /anonym\n\nto: 62856xxxxxxx\n from: Penggemarmu\n Pesan: aku sebenarnya suka kamu🫣" },
                { role: "user", content: message },
            ],
            model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
            // max_tokens: null,
            temperature: 0.7,
            top_p: 0.7,
            top_k: 50,
            repetition_penalty: 1,
            stop: ["<|eot_id|>", "<|eom_id|>"],
            stream: true
        });

        let sentence = '';
        for await (const token of response) {
            sentence += token.choices[0]?.delta?.content + '';
        }
        sentence = sentence.trim();
        return sentence;

    } catch (error) {
        console.log("Gagal Generate Response. Error", error);
        return "Maaf, server sedang sibuk, silahkan coba beberapa saat lagi"
    }
}

export const useLLM = async (message: string) => {
    // return openaiChat(message)
    return togetherAI(message)
    // return "Halo"
}