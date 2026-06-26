import axios from "axios";
import { logger } from "../utils/logger.js";
import { retry } from "../utils/retry.js";

export interface ITADSearchResult {
  id: string; // uuid
  title: string;
}

export interface ITADPriceResult {
  shop: {
    id: string | number;
    name: string;
  };
  price: {
    amount: number;
    currency: string;
  };
  regular: {
    amount: number;
    currency: string;
  };
  cut: number;
  url: string;
}

export class IsThereAnyDealService {
  private apiKey: string | null = null;
  
  constructor() {
    this.apiKey = process.env.ITAD_API_KEY || null;
    if (!this.apiKey) {
      logger.info("ITAD_API_KEY is not defined. IsThereAnyDeal service is disabled.");
    }
  }

  isEnabled(): boolean {
    return this.apiKey !== null && this.apiKey.length > 0;
  }
  
  async searchGame(title: string): Promise<ITADSearchResult[]> {
    if (!this.apiKey) return [];
    const apiKey = this.apiKey;
    return retry(async () => {
      const url = `https://api.isthereanydeal.com/games/search/v1?key=${apiKey}&title=${encodeURIComponent(title)}&results=5`;
      const res = await axios.get(url, { timeout: 5000 });
      return Array.isArray(res.data) ? res.data : [];
    }, 3, 1000, 2).catch((e: Error) => {
      logger.error(`IsThereAnyDeal search error for ${title} (all retries failed): ${e.message}`);
      return [];
    });
  }
  
  async getPrices(uuids: string[]): Promise<{ [uuid: string]: ITADPriceResult[] }> {
    if (!this.apiKey || uuids.length === 0) return {};
    const apiKey = this.apiKey;
    return retry(async () => {
      const url = `https://api.isthereanydeal.com/games/prices/v3?key=${apiKey}`;
      const res = await axios.post(url, uuids, { timeout: 5000 });
      
      const results: { [uuid: string]: ITADPriceResult[] } = {};
      if (res.data && typeof res.data === "object") {
        for (const uuid of uuids) {
          const gameData = res.data[uuid];
          if (gameData && Array.isArray(gameData.prices)) {
            results[uuid] = gameData.prices.map((p: Record<string, unknown>) => ({
              shop: {
                id: (p.shop as Record<string, unknown>)?.id || "",
                name: (p.shop as Record<string, unknown>)?.name || ""
              },
              price: {
                amount: (p.price as Record<string, unknown>)?.amount || 0,
                currency: (p.price as Record<string, unknown>)?.currency || "USD"
              },
              regular: {
                amount: (p.regular as Record<string, unknown>)?.amount || 0,
                currency: (p.regular as Record<string, unknown>)?.currency || "USD"
              },
              cut: (p.cut as number) || 0,
              url: (p.url as string) || ""
            }));
          }
        }
      }
      return results;
    }, 3, 1000, 2).catch((e: Error) => {
      logger.error(`IsThereAnyDeal getPrices error (all retries failed): ${e.message}`);
      return {};
    });
  }
}

export const isThereAnyDealService = new IsThereAnyDealService();
