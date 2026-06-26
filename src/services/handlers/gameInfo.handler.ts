import { cheapSharkService } from "../cheapshark.service.js";
import { steamService } from "../steam.service.js";
import { dbService } from "../db.service.js";
import { gameNameService } from "../gameName.service.js";
import { logger } from "../../utils/logger.js";
import type { GameInfoResponse, DbGame, DbGamePrice } from "../../types/game.js";
import type { SteamAppDetails } from "../steam.service.js";
import type { GameService } from "../game.service.js";

/**
 * 게임 상세 정보 핸들러
 * - CheapShark 검색 → Steam AppDetails 상세 조회
 * - DB 캐시 우선 → API 실시간 → DB Fallback
 */
export class GameInfoHandler {
  constructor(private parent: GameService) {}

  /**
   * gameDropGameInfo: 게임 상세 정보 조회 (DB 우선 조회 및 Fallback 지원)
   */
  async getGameInfo(title: string): Promise<GameInfoResponse | null> {
    const targetTitleEn = await gameNameService.translateToEnglish(title);
    const slug = gameNameService.toSlug(targetTitleEn);

    if (dbService.isConnected()) {
      const dbGame = await dbService.findGameBySlugOrTitle(slug, title) as DbGame | null;
      const isFresh = dbGame && dbGame.developer &&
        (Date.now() - new Date(dbGame.updated_at).getTime() < 24 * 3600 * 1000); // 24 Hours TTL

      if (isFresh && dbGame) {
        logger.info(`Serving detailed game info from database cache for: ${title}`);
        const prices = (await dbService.getGamePrices(dbGame.id)) as DbGamePrice[];
        const cheapest = prices.sort((a, b) => parseFloat(a.sale_price) - parseFloat(b.sale_price))[0];
        const cheapestPriceText = cheapest ? `₩${Math.round(parseFloat(cheapest.sale_price)).toLocaleString()}` : "무료 또는 정보 없음";

        return {
          title: dbGame.localized_title || dbGame.title,
          localizedTitle: dbGame.localized_title || dbGame.title,
          description: "상세 정보가 데이터베이스에 캐싱되어 있습니다.",
          developer: dbGame.developer || "Unknown",
          publisher: dbGame.publisher || "Unknown",
          releaseDate: dbGame.release_date || "Unknown",
          genres: [],
          price: cheapestPriceText,
          source: "database"
        };
      }
    }

    let source: "api" | "db_fallback" = "api";
    let message = "";

    try {
      await this.parent.updateExchangeRate();
      const searchResults = await cheapSharkService.searchGames(targetTitleEn);
      if (searchResults.length > 0) {
        const targetGame = searchResults.find(
          (g) => g.external.toLowerCase() === targetTitleEn.toLowerCase()
        ) || searchResults[0];

        let steamInfo: SteamAppDetails | null = null;
        if (targetGame.steamAppID) {
          steamInfo = await steamService.getGameInfo(targetGame.steamAppID);
        }

        const gameSlug = gameNameService.toSlug(targetGame.external);
        const localizedTitle = await gameNameService.translateToKorean(targetGame.external);

        let developer = "Unknown";
        let publisher = "Unknown";
        let releaseDate = "Unknown";
        let genres: string[] = [];
        let description = "상세 설명이 제공되지 않는 게임입니다.";
        let priceText = this.parent.formatToKRW(targetGame.cheapest);

        if (steamInfo) {
          developer = steamInfo.developers?.[0] || "Unknown";
          publisher = steamInfo.publishers?.[0] || "Unknown";
          releaseDate = steamInfo.release_date?.date || "Unknown";
          genres = steamInfo.genres?.map((g) => g.description) || [];
          description = this.parent.stripHtml(steamInfo.short_description || steamInfo.detailed_description || "");
          priceText = steamInfo.price_overview?.final_formatted || 
                      (steamInfo.price_overview?.initial_formatted ? steamInfo.price_overview.initial_formatted : "무료 또는 정보 없음");
        }

        const dealUrl = targetGame.cheapestDealID ? await this.parent.resolveDirectStoreUrl("Steam", targetGame.cheapestDealID, gameSlug, targetGame.external, targetGame.steamAppID) : "";

        if (dbService.isConnected()) {
          try {
            const dbGame = await dbService.saveGame({
              title: targetGame.external,
              localized_title: localizedTitle,
              slug: gameSlug,
              developer,
              publisher,
              release_date: releaseDate,
              steam_app_id: targetGame.steamAppID || undefined,
              cheapshark_game_id: targetGame.gameID,
              thumbnail: targetGame.thumb
            });

            const priceVal = this.parent.convertToKRWNumber(targetGame.cheapest);
            await dbService.saveGamePrices(dbGame.id, [{
              store: "Steam",
              normalPrice: priceVal,
              salePrice: priceVal,
              discountPercent: 0,
              url: dealUrl
            }]);
          } catch (dbErr: unknown) {
            const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
            logger.warn(`Failed to save game info to database: ${msg}`);
          }
        }

        return {
          title: localizedTitle || targetGame.external,
          localizedTitle: localizedTitle || targetGame.external,
          description,
          developer,
          publisher,
          releaseDate,
          genres,
          price: priceText,
          source
        };
      }
    } catch (e: unknown) {
      source = "db_fallback";
      const msg = e instanceof Error ? e.message : String(e);
      message = `Latest cached data returned due to API error: ${msg}`;
      logger.warn(`Detailed game info API sync failed: ${msg}`);
    }

    if (dbService.isConnected()) {
      const dbGame = await dbService.findGameBySlugOrTitle(slug, title) as DbGame | null;
      if (dbGame) {
        const prices = (await dbService.getGamePrices(dbGame.id)) as DbGamePrice[];
        const cheapest = prices.sort((a, b) => parseFloat(a.sale_price) - parseFloat(b.sale_price))[0];
        const cheapestPriceText = cheapest ? `₩${Math.round(parseFloat(cheapest.sale_price)).toLocaleString()}` : "무료 또는 정보 없음";

        return {
          title: dbGame.localized_title || dbGame.title,
          localizedTitle: dbGame.localized_title || dbGame.title,
          description: "상세 설명이 제공되지 않는 게임입니다. (API 장애 상태)",
          developer: dbGame.developer || "Unknown",
          publisher: dbGame.publisher || "Unknown",
          releaseDate: dbGame.release_date || "Unknown",
          genres: [],
          price: cheapestPriceText,
          source,
          message
        };
      }
    }

    return null;
  }
}
