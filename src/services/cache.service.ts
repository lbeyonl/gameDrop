import { Redis } from "ioredis";
import { logger } from "../utils/logger.js";

export class CacheService {
  private redis: Redis | null = null;
  private memoryCache = new Map<string, { value: unknown; expiresAt: number }>();
  
  constructor() {
    const redisUrl = process.env.REDIS_URL;
    const redisHost = process.env.REDIS_HOST;
    if (redisUrl || redisHost) {
      try {
        this.redis = redisUrl ? new Redis(redisUrl) : new Redis({ host: redisHost });
        this.redis.on("error", (err: Error) => {
          logger.error("Redis connection error: " + err.message);
        });
        this.redis.on("connect", () => {
          logger.info("Connected to Redis cache");
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.error("Failed to initialize Redis client: " + msg);
      }
    } else {
      logger.info("No Redis configuration found, using in-memory cache");
    }
  }
  
  async get<T>(key: string): Promise<T | null> {
    if (this.redis) {
      try {
        const val = await this.redis.get(key);
        return val ? JSON.parse(val) as T : null;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.error(`Redis get error for key ${key}: ${msg}`);
      }
    }
    
    const cached = this.memoryCache.get(key);
    if (cached) {
      if (Date.now() < cached.expiresAt) {
        return cached.value as T;
      }
      this.memoryCache.delete(key);
    }
    return null;
  }
  
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
        return;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.error(`Redis set error for key ${key}: ${msg}`);
      }
    }
    
    this.memoryCache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000
    });
  }
  
  async del(key: string): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.del(key);
        return;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.error(`Redis del error for key ${key}: ${msg}`);
      }
    }
    this.memoryCache.delete(key);
  }
}

export const cacheService = new CacheService();
