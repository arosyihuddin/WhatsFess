import redis from "./utils/redisClient";
import { WhatsFess } from './app';

(async () => {
    // Inisialisasi Redis
    redis.on('connect', () => {
        console.log('Redis Connected');
        WhatsFess();
    }); 
})();