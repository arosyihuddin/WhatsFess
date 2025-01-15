// redisClient.ts
import Redis from 'ioredis';
console.log("Redis Connecting..")
const redis = new Redis({
    host: '127.0.0.1',
    port: 6379,
    // password: 'your_password', // Jika ada
});

redis.on('connect', () => {
    console.log('Redis Connected');
});

redis.on('error', (err) => {
    console.error('Redis error:', err);
});

export default redis;
