import axios from "axios";
import { logger } from "../utils/logger.js";
import { retry } from "../utils/retry.js";

export interface SteamAppDetails {
  name: string;
  short_description: string;
  detailed_description: string;
  developers?: string[];
  publishers?: string[];
  release_date?: {
    coming_soon: boolean;
    date: string;
  };
  genres?: {
    id: string;
    description: string;
  }[];
  price_overview?: {
    currency: string;
    initial: number;
    final: number;
    discount_percent: number;
    initial_formatted: string;
    final_formatted: string;
  };
}

export class SteamService {
  async getGameInfo(steamAppID: string): Promise<SteamAppDetails | null> {
    return retry(async () => {
      const url = `https://store.steampowered.com/api/appdetails?appids=${steamAppID}&l=korean`;
      const res = await axios.get(url, { timeout: 5000 });
      
      if (res.data && res.data[steamAppID] && res.data[steamAppID].success) {
        return res.data[steamAppID].data as SteamAppDetails;
      }
      return null;
    }, 3, 1500, 2).catch((e: Error) => {
      logger.error(`Steam API appdetails error for appid ${steamAppID} (all retries failed): ${e.message}`);
      return null;
    });
  }
}

export const steamService = new SteamService();
