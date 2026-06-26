import { cheapSharkService } from "../cheapshark.service.js";
import { cacheService } from "../cache.service.js";
import { dbService } from "../db.service.js";
import { gameNameService } from "../gameName.service.js";
import { logger } from "../../utils/logger.js";
import type { DiscountGameResponse, DbGamePrice, InternalDeal } from "../../types/game.js";
import type { GameService } from "../game.service.js";
import { FreeGamesHandler } from "./freeGames.handler.js";

/**
 * 할인 게임 핸들러
 * - Steam Storefront API (직접) + CheapShark (Epic) 할인 데이터 수집
 * - DB 캐시 우선 → API 실시간 → DB Fallback
 */
export class DiscountsHandler {
  constructor(
    private parent: GameService,
    private freeGamesHandler: FreeGamesHandler
  ) {}

  /**
   * gameDropDiscounts: 현재 할인 중인 게임 조회 (DB 우선 조회 및 Fallback 지원)
   */
  async getDiscounts(platform: string, minDiscount: number, limit: number): Promise<DiscountGameResponse[]> {
    const lowerPlatform = platform.toLowerCase();
    const freshKey = `discounts_fresh:${lowerPlatform}:${minDiscount}:${limit}`;
    const isFresh = await cacheService.get<boolean>(freshKey);

    if (isFresh && dbService.isConnected()) {
      const dbResults = await this.queryDbDiscounts(lowerPlatform, minDiscount, limit);
      if (dbResults.length > 0) {
        logger.info(`Serving ${platform} discounts list from database cache`);
        return this.mapDbPricesToResponse(dbResults, "database");
      }
    }

    let source: "api" | "db_fallback" = "api";
    let message = "";
    const apiDeals: DiscountGameResponse[] = [];

    try {
      await this.parent.updateExchangeRate();
      let steamDeals: InternalDeal[] = [];
      let epicDeals: InternalDeal[] = [];

      // 1. Fetch Steam deals from official storefront API
      if (lowerPlatform === "all" || lowerPlatform === "steam") {
        const { discounts } = await this.freeGamesHandler.fetchSteamStorefrontData();
        steamDeals = discounts.map(d => ({
          title: d.title,
          discount: d.discount,
          normalPrice: d.normalPrice,
          salePrice: d.salePrice,
          store: d.store,
          url: d.url,
          thumbnail: d.thumbnail,
          steamAppID: d.steamAppID,
          slug: gameNameService.toSlug(d.title)
        }));
      }

      // 2. Fetch Epic deals from CheapShark
      if (lowerPlatform === "all" || lowerPlatform === "epic" || lowerPlatform.includes("epic")) {
        const deals = await cheapSharkService.getDeals({
          storeID: "25",
          onSale: 1,
          sortBy: "Savings",
          pageSize: Math.max(limit * 2, 50)
        });

        const resolvedEpic = await Promise.all(deals.map(async (deal) => {
          const slug = gameNameService.toSlug(deal.title);
          const localizedTitle = await gameNameService.translateToKorean(deal.title);
          const discountVal = Math.round(parseFloat(deal.savings));
          const urlVal = await this.parent.resolveDirectStoreUrl("Epic Games Store", deal.dealID, slug, deal.title, deal.steamAppID);
          return {
            title: localizedTitle || deal.title,
            discount: discountVal,
            normalPrice: this.parent.convertToKRWNumber(deal.normalPrice),
            salePrice: this.parent.convertToKRWNumber(deal.salePrice),
            store: "Epic Games Store",
            url: urlVal,
            thumbnail: deal.thumb,
            cheapshark_game_id: deal.gameID,
            slug
          } satisfies InternalDeal;
        }));
        epicDeals = resolvedEpic;
      }

      // 3. Merge, filter, sort and slice
      const combined: InternalDeal[] = [...steamDeals, ...epicDeals]
        .filter(d => d.discount >= minDiscount)
        .sort((a, b) => b.discount - a.discount)
        .slice(0, limit);

      for (const deal of combined) {
        apiDeals.push({
          title: deal.title,
          localizedTitle: deal.title,
          discount: deal.discount,
          normalPrice: `₩${Math.round(deal.normalPrice).toLocaleString()}`,
          salePrice: `₩${Math.round(deal.salePrice).toLocaleString()}`,
          store: deal.store,
          url: deal.url,
          source: "api",
          thumbnail: deal.thumbnail
        });

        if (dbService.isConnected()) {
          try {
            const dbGame = await dbService.saveGame({
              title: deal.title,
              localized_title: deal.title,
              slug: deal.slug || gameNameService.toSlug(deal.title),
              cheapshark_game_id: deal.cheapshark_game_id || undefined,
              steam_app_id: deal.steamAppID || undefined,
              thumbnail: deal.thumbnail
            });

            await dbService.saveGamePrices(dbGame.id, [{
              store: deal.store,
              normalPrice: deal.normalPrice,
              salePrice: deal.salePrice,
              discountPercent: deal.discount,
              url: deal.url
            }]);
          } catch (dbErr: unknown) {
            const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
            logger.warn(`Failed to save deal to database: ${msg}`);
          }
        }
      }

      await cacheService.set(freshKey, true, 3 * 3600); // 3 Hours TTL
      if (!dbService.isConnected()) {
        return apiDeals.slice(0, limit);
      }
    } catch (e: unknown) {
      source = "db_fallback";
      const msg = e instanceof Error ? e.message : String(e);
      message = `Latest cached data returned due to API error: ${msg}`;
      logger.warn(`Discounts API failed: ${msg}`);
    }

    if (dbService.isConnected()) {
      const dbResults = await this.queryDbDiscounts(lowerPlatform, minDiscount, limit);
      return this.mapDbPricesToResponse(dbResults, source, message);
    }

    return apiDeals.slice(0, limit);
  }

  // ===== Private Helpers =====

  private async queryDbDiscounts(lowerPlatform: string, minDiscount: number, limit: number): Promise<DbGamePrice[]> {
    let queryStr = `
      SELECT gp.*, g.title, g.localized_title, g.thumbnail
      FROM game_prices gp
      JOIN games g ON gp.game_id = g.id
      WHERE gp.discount_percent >= $1
    `;
    const params: (number | string)[] = [minDiscount];

    if (lowerPlatform === "steam") {
      queryStr += ` AND gp.store = 'Steam'`;
    } else if (lowerPlatform === "epic" || lowerPlatform.includes("epic")) {
      queryStr += ` AND gp.store = 'Epic Games Store'`;
    } else {
      queryStr += ` AND gp.store IN ('Steam', 'Epic Games Store')`;
    }

    queryStr += ` ORDER BY gp.discount_percent DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const res = await dbService.query(queryStr, params);
    return res.rows as DbGamePrice[];
  }

  private mapDbPricesToResponse(
    rows: DbGamePrice[],
    source: "database" | "api" | "db_fallback",
    message?: string
  ): DiscountGameResponse[] {
    return rows.map((row) => ({
      title: row.localized_title || row.title,
      localizedTitle: row.localized_title || row.title,
      discount: row.discount_percent,
      normalPrice: `₩${Math.round(parseFloat(row.normal_price)).toLocaleString()}`,
      salePrice: `₩${Math.round(parseFloat(row.sale_price)).toLocaleString()}`,
      store: row.store,
      url: row.url || "",
      source,
      thumbnail: row.thumbnail || "",
      ...(message ? { message } : {})
    }));
  }
}
