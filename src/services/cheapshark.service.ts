import axios from "axios";
import { logger } from "../utils/logger.js";
import { retry } from "../utils/retry.js";

export interface CheapSharkDeal {
  title: string;
  dealID: string;
  storeID: string;
  gameID: string;
  salePrice: string;
  normalPrice: string;
  savings: string;
  thumb: string;
  steamAppID: string | null;
}

export interface CheapSharkGameSearchResult {
  gameID: string;
  steamAppID: string | null;
  cheapest: string;
  cheapestDealID: string;
  external: string;
  thumb: string;
}

export interface CheapSharkGameDetails {
  info: {
    title: string;
    steamAppID: string | null;
    thumb: string;
  };
  deals: {
    storeID: string;
    dealID: string;
    price: string;
    retailPrice: string;
    savings: string;
  }[];
}

export class CheapSharkService {
  private storesMap: { [id: string]: string } = {
    "1": "Steam",
    "7": "GOG",
    "11": "Humble Store",
    "25": "Epic Games Store"
  };
  
  constructor() {
    this.fetchStores().catch(() => {});
  }
  
  private async fetchStores(): Promise<void> {
    try {
      const res = await axios.get("https://www.cheapshark.com/api/1.0/stores", { timeout: 3000 });
      if (Array.isArray(res.data)) {
        for (const store of res.data) {
          if (store.storeID && store.storeName) {
            this.storesMap[store.storeID] = store.storeName;
          }
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error("Failed to fetch stores from CheapShark, using default mapping: " + msg);
    }
  }
  
  getStoreName(storeID: string): string {
    return this.storesMap[storeID] || `Store ${storeID}`;
  }
  
  async searchGames(title: string): Promise<CheapSharkGameSearchResult[]> {
    return retry(async () => {
      const res = await axios.get(`https://www.cheapshark.com/api/1.0/games?title=${encodeURIComponent(title)}`, { timeout: 5000 });
      return Array.isArray(res.data) ? res.data : [];
    }, 3, 1000, 2).catch((e: Error) => {
      logger.error(`CheapShark searchGames error for ${title} (all retries failed): ${e.message}`);
      return [];
    });
  }
  
  async getGameDetails(gameID: string): Promise<CheapSharkGameDetails | null> {
    return retry(async () => {
      const res = await axios.get(`https://www.cheapshark.com/api/1.0/games?id=${gameID}`, { timeout: 5000 });
      if (res.data && res.data.info) {
        return res.data as CheapSharkGameDetails;
      }
      return null;
    }, 3, 1000, 2).catch((e: Error) => {
      logger.error(`CheapShark getGameDetails error for ID ${gameID} (all retries failed): ${e.message}`);
      return null;
    });
  }
  
  async getDeals(params: {
    storeID?: string;
    upperPrice?: number;
    onSale?: number;
    sortBy?: string;
    desc?: number;
    pageSize?: number;
    title?: string;
  }): Promise<CheapSharkDeal[]> {
    return retry(async () => {
      const queryParams = new URLSearchParams();
      if (params.storeID) queryParams.append("storeID", params.storeID);
      if (params.upperPrice !== undefined) queryParams.append("upperPrice", params.upperPrice.toString());
      if (params.onSale !== undefined) queryParams.append("onSale", params.onSale.toString());
      if (params.sortBy) queryParams.append("sortBy", params.sortBy);
      if (params.desc !== undefined) queryParams.append("desc", params.desc.toString());
      if (params.pageSize !== undefined) queryParams.append("pageSize", params.pageSize.toString());
      if (params.title) queryParams.append("title", params.title);
      
      const url = `https://www.cheapshark.com/api/1.0/deals?${queryParams.toString()}`;
      const res = await axios.get(url, { timeout: 5000 });
      return Array.isArray(res.data) ? res.data : [];
    }, 3, 1000, 2).catch((e: Error) => {
      logger.error(`CheapShark getDeals error (all retries failed): ${e.message}`);
      return [];
    });
  }
}

export const cheapSharkService = new CheapSharkService();
