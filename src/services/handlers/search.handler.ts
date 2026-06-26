import { cheapSharkService } from "../cheapshark.service.js";
import { cacheService } from "../cache.service.js";
import { dbService } from "../db.service.js";
import { gameNameService } from "../gameName.service.js";
import { logger } from "../../utils/logger.js";
import type { SearchGameResponse, DbGame, DbGamePrice } from "../../types/game.js";
import type { GameService } from "../game.service.js";

/**
 * 게임 검색 핸들러
 * - CheapShark 기반 영문 검색 + 한글 퍼지 매칭
 * - DB 캐시 우선 → API 실시간 → DB Fallback
 */
export class SearchHandler {
  constructor(private parent: GameService) {}

  /**
   * gameDropSearch: 게임명 검색 (DB 우선 조회 및 Fallback 지원)
   */
  async searchGames(keyword: string): Promise<SearchGameResponse[]> {
    const trimmed = keyword.trim();
    if (!trimmed) return [];

    const cacheKey = `search_results_query:${trimmed.toLowerCase()}`;
    const cachedResults = await cacheService.get<SearchGameResponse[]>(cacheKey);
    if (cachedResults && cachedResults.length > 0) {
      logger.info(`Serving search results from cache for query: "${trimmed}"`);
      return cachedResults;
    }

    const targetTitleEn = await gameNameService.translateToEnglish(trimmed);
    let source: "api" | "db_fallback" = "api";
    let message = "";
    const apiResults: SearchGameResponse[] = [];

    try {
      await this.parent.updateExchangeRate();
      const searchResults = await cheapSharkService.searchGames(targetTitleEn);
      
      const resolvedResults = await Promise.all(searchResults.map(async (g) => {
        const gameSlug = gameNameService.toSlug(g.external);
        const localizedTitle = await gameNameService.translateToKorean(g.external);
        const cheapestPriceVal = this.parent.convertToKRWNumber(g.cheapest);
        const dealUrl = g.cheapestDealID ? await this.parent.resolveDirectStoreUrl("Steam", g.cheapestDealID, gameSlug, g.external, g.steamAppID) : "";
        return { g, gameSlug, localizedTitle, cheapestPriceVal, dealUrl };
      }));

      for (const { g, gameSlug, localizedTitle, cheapestPriceVal, dealUrl } of resolvedResults) {
        apiResults.push({
          title: localizedTitle || g.external,
          localizedTitle: localizedTitle || g.external,
          gameID: g.gameID,
          steamAppID: g.steamAppID || "",
          cheapestPrice: this.parent.formatToKRW(g.cheapest),
          url: dealUrl,
          thumb: g.thumb,
          source: "api"
        });

        if (dbService.isConnected()) {
          try {
            const dbGame = await dbService.saveGame({
              title: g.external,
              localized_title: localizedTitle,
              slug: gameSlug,
              cheapshark_game_id: g.gameID,
              steam_app_id: g.steamAppID || undefined,
              thumbnail: g.thumb
            });

            await dbService.saveGamePrices(dbGame.id, [{
              store: "CheapShark Cheapest Store",
              normalPrice: cheapestPriceVal,
              salePrice: cheapestPriceVal,
              discountPercent: 0,
              url: dealUrl
            }]);
          } catch (dbErr: unknown) {
            const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
            logger.warn(`Failed to save search result to database: ${msg}`);
          }
        }
      }

      if (apiResults.length > 0) {
        await cacheService.set(cacheKey, apiResults, 3 * 3600); // Cache search query for 3 hours
      }
      return apiResults;
    } catch (e: unknown) {
      source = "db_fallback";
      const msg = e instanceof Error ? e.message : String(e);
      message = `Latest cached data returned due to API error: ${msg}`;
      logger.warn(`Search API failed: ${msg}`);
    }

    // Fallback: DB에서 ILIKE를 이용하여 복수 매칭되는 게임 검색 및 반환
    if (dbService.isConnected()) {
      try {
        const queryStr = `
          SELECT * FROM games 
          WHERE title ILIKE $1 OR localized_title ILIKE $1
          LIMIT 30
        `;
        const searchPattern = `%${trimmed}%`;
        const res = await dbService.query(queryStr, [searchPattern]);
        
        const fallbackResults: SearchGameResponse[] = [];
        for (const row of res.rows as DbGame[]) {
          const prices = (await dbService.getGamePrices(row.id)) as DbGamePrice[];
          const cheapest = prices.sort((a, b) => parseFloat(a.sale_price) - parseFloat(b.sale_price))[0];
          
          fallbackResults.push({
            title: row.localized_title || row.title,
            localizedTitle: row.localized_title || row.title,
            gameID: row.cheapshark_game_id || "",
            steamAppID: row.steam_app_id || "",
            cheapestPrice: cheapest ? `₩${Math.round(parseFloat(cheapest.sale_price)).toLocaleString()}` : "₩0",
            url: cheapest ? (cheapest.url || "") : "",
            thumb: row.thumbnail || "",
            source,
            message
          });
        }
        
        if (fallbackResults.length > 0) {
          return fallbackResults;
        }
      } catch (dbErr: unknown) {
        const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
        logger.error(`Database search fallback failed: ${msg}`);
      }
    }

    return apiResults;
  }
}
