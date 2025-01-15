import redis from "./utils/redisClient";
import { WhatsFess } from './app';

(async () => {
    // Inisialisasi Redis
    redis
    // Inisialisasi dan mulai klien WhatsApp
    WhatsFess();
})();