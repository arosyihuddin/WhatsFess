import {WhatsFess} from "./bot"

(async () => {
    // Inisialisasi dan mulai klien WhatsApp
    const client = new WhatsFess()
    client.startSock().catch(err => {
        console.error(`Gagal memulai koneksi WhatsApp Status Code ${err.output.statusCode}: ${err.message}`)
        process.exit(1)
    })

})();