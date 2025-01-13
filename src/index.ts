import {WhatsFess} from "./bot"

(async () => {
    // Inisialisasi dan mulai klien WhatsApp
    const client = new WhatsFess()
    client.startSock().catch(err => {
        console.error('Gagal memulai koneksi WhatsApp:', err)
        process.exit(1)
    })

})();