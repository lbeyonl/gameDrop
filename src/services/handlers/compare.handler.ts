import { cheapSharkService } from "../cheapshark.service.js";
import { dbService } from "../db.service.js";
import { gameNameService } from "../gameName.service.js";
import { isThereAnyDealService } from "../isthereanydeal.service.js";
import { logger } from "../../utils/logger.js";
import type { ComparePriceResponse, StorePrice, DbGame, DbGamePrice, SavePriceInput } from "../../types/game.js";
import type { GameService } from "../game.service.js";

/**
 * 가격 비교 핸들러
 * - CheapShark + IsThereAnyDeal(ITAD) 가격 데이터 병합
 * - DB 캐시 우선 → API 실시간 → DB Fallback
 */
export class CompareHandler {
  constructor(private parent: GameService) {}

  /**
   * gameDropComparePrice: 게임 가격 비교 (DB 우선 조회 및 Fallback 지원)
   */
  async comparePrice(title: string): Promise<ComparePriceResponse | null> {
    const targetTitleEn = await gameNameService.translateToEnglish(title);
    const slug = gameNameService.toSlug(targetTitleEn);

    if (dbService.isConnected()) {
      const dbGame = await dbService.findGameBySlugOrTitle(slug, title) as DbGame | null;
      if (dbGame) {
        const prices = (await dbService.getGamePrices(dbGame.id)) as DbGamePrice[];
        const isFresh = prices.length > 0 &&
          (Date.now() - new Date(prices[0].last_checked_at).getTime() < 3 * 3600 * 1000); // 3 Hours TTL

        if (isFresh) {
          logger.info(`Serving price comparisons from database cache for: ${title}`);
          return this.buildResponseFromDbPrices(dbGame, prices, "database");
        }
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

        const details = await cheapSharkService.getGameDetails(targetGame.gameID);
        if (details && details.deals && details.deals.length > 0) {
          const gameSlug = gameNameService.toSlug(details.info.title);
          const localizedTitle = await gameNameService.translateToKorean(details.info.title);

          // CheapShark 가격 데이터 수집
          const pricesToSave: SavePriceInput[] = await Promise.all(details.deals.map(async (deal) => {
            const storeName = cheapSharkService.getStoreName(deal.storeID);
            const urlVal = await this.parent.resolveDirectStoreUrl(storeName, deal.dealID, gameSlug, details.info.title, details.info.steamAppID);

            return {
              store: storeName,
              normalPrice: this.parent.convertToKRWNumber(deal.retailPrice),
              salePrice: this.parent.convertToKRWNumber(deal.price),
              discountPercent: Math.round(parseFloat(deal.savings)),
              url: urlVal
            };
          }));

          // ITAD 가격 데이터 병합 (API Key가 있을 때만)
          if (isThereAnyDealService.isEnabled()) {
            try {
              const itadPrices = await this.fetchITADPrices(targetTitleEn);
              const existingStores = new Set(pricesToSave.map(p => p.store.toLowerCase()));

              for (const itadPrice of itadPrices) {
                // CheapShark에 이미 있는 스토어는 건너뛰기
                if (existingStores.has(itadPrice.store.toLowerCase())) continue;
                pricesToSave.push(itadPrice);
              }
              if (itadPrices.length > 0) {
                logger.info(`Enriched price comparison with ${itadPrices.length} additional ITAD store(s) for: ${title}`);
              }
            } catch (itadErr: unknown) {
              const msg = itadErr instanceof Error ? itadErr.message : String(itadErr);
              logger.warn(`ITAD price enrichment failed (non-blocking): ${msg}`);
            }
          }

          if (dbService.isConnected()) {
            try {
              const dbGame = await dbService.saveGame({
                title: details.info.title,
                localized_title: localizedTitle,
                slug: gameSlug,
                cheapshark_game_id: targetGame.gameID,
                steam_app_id: targetGame.steamAppID || undefined,
                thumbnail: targetGame.thumb
              });
              await dbService.saveGamePrices(dbGame.id, pricesToSave);
            } catch (dbErr: unknown) {
              const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
              logger.warn(`Failed to save price comparison to database: ${msg}`);
            }
          }

          const sortedPrices: StorePrice[] = pricesToSave
            .map((p) => ({
              store: p.store,
              price: p.salePrice,
              discount: p.discountPercent,
              url: p.url || ""
            }))
            .sort((a, b) => a.price - b.price);

          const bestDeal = sortedPrices[0];
          return {
            title: localizedTitle || details.info.title,
            localizedTitle: localizedTitle || details.info.title,
            stores: sortedPrices,
            bestDeal: bestDeal ? {
              store: bestDeal.store,
              price: bestDeal.price,
              url: bestDeal.url
            } : null,
            source
          };
        }
      }
    } catch (e: unknown) {
      source = "db_fallback";
      const msg = e instanceof Error ? e.message : String(e);
      message = `Latest cached data returned due to API error: ${msg}`;
      logger.warn(`Price comparison API sync failed: ${msg}`);
    }

    if (dbService.isConnected()) {
      const dbGame = await dbService.findGameBySlugOrTitle(slug, title) as DbGame | null;
      if (dbGame) {
        const prices = (await dbService.getGamePrices(dbGame.id)) as DbGamePrice[];
        return this.buildResponseFromDbPrices(dbGame, prices, source, message);
      }
    }

    return null;
  }

  // ===== Private Helpers =====

  /**
   * IsThereAnyDeal API에서 추가 가격 데이터 조회
   */
  private async fetchITADPrices(gameName: string): Promise<SavePriceInput[]> {
    const searchResults = await isThereAnyDealService.searchGame(gameName);
    if (searchResults.length === 0) return [];

    const topResult = searchResults[0];
    const priceData = await isThereAnyDealService.getPrices([topResult.id]);
    const prices = priceData[topResult.id];
    if (!prices || prices.length === 0) return [];

    return prices.map(p => ({
      store: p.shop.name || `ITAD Shop ${p.shop.id}`,
      normalPrice: Math.round(p.regular.amount * (p.regular.currency === "USD" ? this.parent.getKrwRate() : 1)),
      salePrice: Math.round(p.price.amount * (p.price.currency === "USD" ? this.parent.getKrwRate() : 1)),
      discountPercent: p.cut,
      url: p.url
    }));
  }

  private buildResponseFromDbPrices(
    dbGame: DbGame,
    prices: DbGamePrice[],
    source: "database" | "api" | "db_fallback",
    message?: string
  ): ComparePriceResponse {
    const sortedPrices: StorePrice[] = prices
      .map((p) => ({
        store: p.store,
        price: Math.round(parseFloat(p.sale_price)),
        discount: p.discount_percent,
        url: p.url || ""
      }))
      .sort((a, b) => a.price - b.price);

    const bestDeal = sortedPrices[0];
    return {
      title: dbGame.localized_title || dbGame.title,
      localizedTitle: dbGame.localized_title || dbGame.title,
      stores: sortedPrices,
      bestDeal: bestDeal ? {
        store: bestDeal.store,
        price: bestDeal.price,
        url: bestDeal.url
      } : null,
      source,
      ...(message ? { message } : {})
    };
  }
}
