import axios from "axios";
import { epicService } from "../epic.service.js";
import { cacheService } from "../cache.service.js";
import { dbService } from "../db.service.js";
import { gameNameService } from "../gameName.service.js";
import { logger } from "../../utils/logger.js";
import type { FreeGameResponse, DbFreeGame } from "../../types/game.js";
import type { GameService } from "../game.service.js";

/**
 * 무료 게임 핸들러
 * - Epic Games Store + Steam Storefront API에서 무료 게임 수집
 * - DB 캐시 우선 → API 실시간 → DB Fallback
 */
export class FreeGamesHandler {
  constructor(private parent: GameService) {}

  /**
   * Steam 공식 Storefront API (featuredcategories)로부터 할인 상품 및 100% 할인 무료 게임 목록 조회
   */
  async fetchSteamStorefrontData(): Promise<{ discounts: InternalSteamDeal[], freeGames: InternalSteamFreeGame[] }> {
    try {
      const url = "https://store.steampowered.com/api/featuredcategories/?l=korean&cc=kr";
      const res = await axios.get(url, { timeout: 5000 });
      const uniqueDeals = new Map<number, SteamStorefrontItem>();
      const freeGames: InternalSteamFreeGame[] = [];
      const now = new Date().toISOString();

      if (res.data) {
        for (const key of Object.keys(res.data)) {
          const cat = res.data[key] as { items?: SteamStorefrontItem[] };
          if (cat && cat.items) {
            for (const item of cat.items) {
              const orig = item.original_price || 0;
              const final = item.final_price || 0;
              const isFreePromo = orig > 0 && final === 0;

              if (isFreePromo) {
                freeGames.push({
                  title: item.name,
                  platform: "Steam",
                  startDate: now,
                  endDate: item.discount_expiration 
                    ? new Date(item.discount_expiration * 1000).toISOString()
                    : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
                  url: `https://store.steampowered.com/app/${item.id}`,
                  thumbnail: item.header_image || item.large_capsule_image || ""
                });
              }

              if (item.discounted || item.discount_percent > 0) {
                uniqueDeals.set(item.id, item);
              }
            }
          }
        }
      }

      const discounts: InternalSteamDeal[] = Array.from(uniqueDeals.values()).map((item) => {
        const norm = (item.original_price || 0) / 100;
        const sale = (item.final_price || 0) / 100;
        return {
          title: item.name,
          discount: item.discount_percent,
          normalPrice: norm,
          salePrice: sale,
          store: "Steam",
          url: `https://store.steampowered.com/app/${item.id}`,
          thumbnail: item.header_image || item.large_capsule_image || "",
          steamAppID: String(item.id)
        };
      });

      return { discounts, freeGames };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error(`Failed to fetch Steam Storefront API: ${msg}`);
      return { discounts: [], freeGames: [] };
    }
  }

  /**
   * 백그라운드 스케줄러: 무료 게임 수집 및 DB 동기화
   */
  async syncFreeGames(): Promise<void> {
    if (!dbService.isConnected()) return;

    logger.info("Syncing Epic & Steam free games to PostgreSQL database...");

    // 1. Epic Games Store 무료 게임 가져오기 및 저장
    try {
      const epicGames = await epicService.getFreeGames();
      for (const g of epicGames) {
        const slug = gameNameService.toSlug(g.title);
        const localizedTitle = await gameNameService.translateToKorean(g.title);
        
        try {
          const dbGame = await dbService.saveGame({
            title: g.title,
            localized_title: localizedTitle,
            slug,
            thumbnail: g.thumbnail
          });
          await dbService.saveFreeGame(dbGame.id, "Epic Games Store", g.startDate, g.endDate, g.url);
        } catch (dbErr: unknown) {
          const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
          logger.warn(`Failed to save Epic free game to DB: ${msg}`);
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error(`Failed to fetch Epic free games: ${msg}`);
    }

    // 2. Steam 공식 Storefront API 무료 게임 가져오기 및 저장
    try {
      const { freeGames } = await this.fetchSteamStorefrontData();
      for (const g of freeGames) {
        const slug = gameNameService.toSlug(g.title);
        const localizedTitle = await gameNameService.translateToKorean(g.title);

        try {
          const dbGame = await dbService.saveGame({
            title: g.title,
            localized_title: localizedTitle,
            slug,
            thumbnail: g.thumbnail
          });
          await dbService.saveFreeGame(dbGame.id, "Steam", g.startDate, g.endDate, g.url);
        } catch (dbErr: unknown) {
          const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
          logger.warn(`Failed to save Steam free game to DB: ${msg}`);
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error(`Failed to sync Steam storefront free games: ${msg}`);
    }
  }

  /**
   * gameDropFreeGames: 현재 무료 배포 중인 게임 조회 (DB 우선 조회 및 Fallback 지원)
   */
  async getFreeGames(platform: string): Promise<FreeGameResponse[]> {
    const lowerPlatform = platform.toLowerCase();
    const freshKey = `free_games_fresh:${lowerPlatform}`;
    const isFresh = await cacheService.get<boolean>(freshKey);

    if (isFresh && dbService.isConnected()) {
      const filtered = await this.queryDbFreeGames(lowerPlatform);
      if (filtered.length > 0) {
        logger.info(`Serving free games list from database cache for platform: ${platform}`);
        return this.mapDbFreeGamesToResponse(filtered, "database");
      }
    }

    let source: "api" | "db_fallback" = "api";
    let message = "";

    try {
      await this.syncFreeGames();
      await cacheService.set(freshKey, true, 12 * 3600); // 12 Hours TTL
    } catch (e: unknown) {
      source = "db_fallback";
      const msg = e instanceof Error ? e.message : String(e);
      message = `Latest cached data returned due to API error: ${msg}`;
      logger.warn(`Free games API sync failed: ${msg}`);
    }

    if (dbService.isConnected()) {
      const filtered = await this.queryDbFreeGames(lowerPlatform);
      return this.mapDbFreeGamesToResponse(filtered, source, message);
    }

    // If database is disconnected, return API results directly
    if (source === "api") {
      const epicGames = await epicService.getFreeGames();
      const { freeGames: steamFreeGames } = await this.fetchSteamStorefrontData();
      const apiGames: FreeGameResponse[] = [];

      if (lowerPlatform === "all" || lowerPlatform === "epic" || lowerPlatform.includes("epic")) {
        apiGames.push(...epicGames.map(g => ({
          title: g.title,
          localizedTitle: g.title,
          platform: g.platform,
          startDate: g.startDate,
          endDate: g.endDate,
          url: g.url,
          source: "api" as const,
          thumbnail: g.thumbnail
        })));
      }

      if (lowerPlatform === "all" || lowerPlatform === "steam") {
        apiGames.push(...steamFreeGames.map(fg => ({
          title: fg.title,
          localizedTitle: fg.title,
          platform: "Steam",
          startDate: fg.startDate,
          endDate: fg.endDate,
          url: fg.url,
          source: "api" as const,
          thumbnail: fg.thumbnail
        })));
      }

      return apiGames;
    }

    return [];
  }

  // ===== Private Helpers =====

  private async queryDbFreeGames(lowerPlatform: string): Promise<DbFreeGame[]> {
    const dbFree = await dbService.getFreeGames();
    return dbFree.filter((fg: DbFreeGame) => {
      if (lowerPlatform === "all") {
        return fg.platform.toLowerCase() === "steam" || fg.platform.toLowerCase() === "epic games store";
      }
      if (lowerPlatform === "steam") return fg.platform.toLowerCase() === "steam";
      if (lowerPlatform === "epic" || lowerPlatform.includes("epic")) return fg.platform.toLowerCase() === "epic games store";
      return false;
    });
  }

  private mapDbFreeGamesToResponse(
    games: DbFreeGame[],
    source: "database" | "api" | "db_fallback",
    message?: string
  ): FreeGameResponse[] {
    return games.map((fg) => ({
      title: fg.localized_title || fg.title,
      localizedTitle: fg.localized_title || fg.title,
      platform: fg.platform,
      startDate: fg.start_date || "",
      endDate: fg.end_date || "",
      url: fg.url || "https://store.steampowered.com",
      source,
      thumbnail: fg.thumbnail || "",
      ...(message ? { message } : {})
    }));
  }
}

// ===== Internal Types =====

interface SteamStorefrontItem {
  id: number;
  name: string;
  original_price: number;
  final_price: number;
  discount_percent: number;
  discount_expiration?: number;
  discounted: boolean;
  header_image?: string;
  large_capsule_image?: string;
}

interface InternalSteamDeal {
  title: string;
  discount: number;
  normalPrice: number;
  salePrice: number;
  store: string;
  url: string;
  thumbnail: string;
  steamAppID: string;
}

interface InternalSteamFreeGame {
  title: string;
  platform: string;
  startDate: string;
  endDate: string;
  url: string;
  thumbnail: string;
}
