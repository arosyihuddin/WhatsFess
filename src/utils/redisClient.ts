// redisClient.ts
import Redis from 'ioredis';
import dotenv from "dotenv";
dotenv.config();

const redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT) || 6379,
    username: process.env.REDIS_USERNAME || '',
    password: process.env.REDIS_PASSWORD || '', // Jika ada
});

redis.on("connecting", () =>{
    console.log("Redis connecting...")
})

redis.on('connect', () => {
    console.log('Redis Connected');
});

redis.on('error', (err) => {
    console.error('Redis error:', err.message);
});

export default redis;
