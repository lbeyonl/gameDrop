import axios from "axios";
import { cheapSharkService } from "./cheapshark.service.js";
import { dbService } from "./db.service.js";
import { gameNameService } from "./gameName.service.js";
import { logger } from "../utils/logger.js";
import { retry } from "../utils/retry.js";
import type {
  FreeGameResponse,
  DiscountGameResponse,
  SearchGameResponse,
  ComparePriceResponse,
  GameInfoResponse,
  SavePriceInput
} from "../types/game.js";

// Handler imports
import { FreeGamesHandler } from "./handlers/freeGames.handler.js";
import { DiscountsHandler } from "./handlers/discounts.handler.js";
import { SearchHandler } from "./handlers/search.handler.js";
import { CompareHandler } from "./handlers/compare.handler.js";
import { GameInfoHandler } from "./handlers/gameInfo.handler.js";

/**
 * GameService — Facade 패턴
 * 
 * 공유 유틸리티 메서드와 핸들러 위임 로직만 포함합니다.
 * 실제 비즈니스 로직은 handlers/ 디렉토리의 개별 핸들러에 구현되어 있습니다.
 */
export class GameService {
  private krwRate = 1380.0; // Fallback rate
  private rateLastUpdated = 0; // Timestamp of last update
  private static RATE_TTL_MS = 60 * 60 * 1000; // 1시간 TTL

  // Handlers
  private freeGamesHandler: FreeGamesHandler;
  private discountsHandler: DiscountsHandler;
  private searchHandler: SearchHandler;
  private compareHandler: CompareHandler;
  private gameInfoHandler: GameInfoHandler;

  constructor() {
    this.freeGamesHandler = new FreeGamesHandler(this);
    this.discountsHandler = new DiscountsHandler(this, this.freeGamesHandler);
    this.searchHandler = new SearchHandler(this);
    this.compareHandler = new CompareHandler(this);
    this.gameInfoHandler = new GameInfoHandler(this);

    this.updateExchangeRate().catch(() => {});
  }

  // ===== Shared Utility Methods (핸들러에서 사용) =====

  /**
   * 실시간 환율 정보 업데이트 (USD -> KRW)
   * 1시간 TTL 기반으로 갱신
   */
  async updateExchangeRate(): Promise<number> {
    const now = Date.now();
    if (this.rateLastUpdated > 0 && (now - this.rateLastUpdated) < GameService.RATE_TTL_MS) {
      return this.krwRate;
    }

    try {
      const res = await retry(
        () => axios.get("https://open.er-api.com/v6/latest/USD", { timeout: 3000 }),
        2, 1000, 2
      );
      if (res.data && res.data.rates && res.data.rates.KRW) {
        this.krwRate = parseFloat(res.data.rates.KRW);
        this.rateLastUpdated = now;
        logger.info(`USD-KRW Exchange Rate updated: 1 USD = ${this.krwRate} KRW`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn(`Failed to fetch live exchange rate: ${msg}. Using fallback: ${this.krwRate} KRW`);
    }
    return this.krwRate;
  }

  /**
   * 현재 KRW 환율 반환
   */
  getKrwRate(): number {
    return this.krwRate;
  }

  /**
   * 달러 가격을 한국 원화 문자열로 변환 (예: 29.99 -> "₩41,300")
   */
  formatToKRW(usdPriceStr: string): string {
    const usd = parseFloat(usdPriceStr);
    if (isNaN(usd)) return "₩0";
    const krw = Math.round(usd * this.krwRate);
    return `₩${krw.toLocaleString()}`;
  }

  /**
   * 달러 가격을 한국 원화 숫자 값으로 변환 (예: 29.99 -> 41380)
   */
  convertToKRWNumber(usdPriceStr: string): number {
    const usd = parseFloat(usdPriceStr);
    if (isNaN(usd)) return 0;
    return Math.round(usd * this.krwRate);
  }

  /**
   * HTML 태그 제거 유틸리티
   */
  stripHtml(text: string): string {
    return text.replace(/<\/?[^>]+(>|$)/g, "").trim();
  }

  /**
   * CheapShark 리디렉션 주소 대신 공식 스토어 직행 주소 해석 매핑
   */
  async resolveDirectStoreUrl(
    storeName: string,
    dealID: string,
    slug: string,
    title: string,
    steamAppID: string | null
  ): Promise<string> {
    const storeLower = storeName.toLowerCase();

    if (storeLower === "steam" && steamAppID) {
      // 제목에 Bundle, Pack, Edition, Collection, Pass, OST, Soundtrack 등이 포함된 경우,
      // 스팀의 App ID가 아니라 Bundle ID 또는 Sub ID일 확률이 높습니다.
      // 이 경우 무리하게 /app/ 경로를 만드는 대신, 스팀의 정확한 상품 종류(/sub/ 또는 /bundle/)로 
      // 리다이렉트해 주는 CheapShark의 원래 리디렉션 링크를 사용하여 404를 방지합니다.
      const isBundleOrPackage = /bundle|pack|edition|collection|pass|ost|soundtrack|complete|deluxe/i.test(title);
      if (!isBundleOrPackage) {
        return `https://store.steampowered.com/app/${steamAppID}`;
      }
    }
    if (storeLower.includes("epic") || storeLower === "epic games store") {
      // CheapShark에서 넘어오는 slug는 게임명 기반이라 에픽 실제 URL과 다름
      // 에픽 스토어 검색 페이지로 연결하여 확실한 접근 보장
      return `https://store.epicgames.com/ko/browse?q=${encodeURIComponent(title)}&sortBy=relevancy&sortDir=DESC&count=1`;
    }

    // 타사 스토어(GOG, Humble, Fanatical 등)는 CheapShark API 리디렉션 링크로 다이렉트 이동
    return `https://www.cheapshark.com/redirect?dealID=${dealID}`;
  }

  // ===== Facade Methods — 핸들러에 위임 =====

  /**
   * 1. gameDropFreeGames: 현재 무료 배포 중인 게임 조회
   */
  async getFreeGames(platform: string): Promise<FreeGameResponse[]> {
    return this.freeGamesHandler.getFreeGames(platform);
  }

  /**
   * 2. gameDropDiscounts: 현재 할인 중인 게임 조회
   */
  async getDiscounts(platform: string, minDiscount: number, limit: number): Promise<DiscountGameResponse[]> {
    return this.discountsHandler.getDiscounts(platform, minDiscount, limit);
  }

  /**
   * 3. gameDropSearch: 게임명 검색
   */
  async searchGames(keyword: string): Promise<SearchGameResponse[]> {
    return this.searchHandler.searchGames(keyword);
  }

  /**
   * 4. gameDropComparePrice: 게임 가격 비교
   */
  async comparePrice(title: string): Promise<ComparePriceResponse | null> {
    return this.compareHandler.comparePrice(title);
  }

  /**
   * 5. gameDropGameInfo: 게임 상세 정보 조회
   */
  async getGameInfo(title: string): Promise<GameInfoResponse | null> {
    return this.gameInfoHandler.getGameInfo(title);
  }

  // ===== 스케줄러용 메서드 =====

  /**
   * 백그라운드 스케줄러: 무료 게임 수집 및 DB 동기화
   */
  async syncFreeGames(): Promise<void> {
    return this.freeGamesHandler.syncFreeGames();
  }

  /**
   * 백그라운드 스케줄러: DB에 등록된 모든 게임들의 가격 정보 갱신 및 히스토리 기록
   */
  async syncAllPrices(): Promise<void> {
    if (!dbService.isConnected()) return;

    const dbGames = await dbService.getAllGames();
    logger.info(`Scheduled price sync started for ${dbGames.length} games...`);

    for (const game of dbGames) {
      try {
        const searchResults = await cheapSharkService.searchGames(game.title);
        if (searchResults.length > 0) {
          const targetGame = searchResults.find(
            (g) => g.external.toLowerCase() === game.title.toLowerCase()
          ) || searchResults[0];

          const details = await cheapSharkService.getGameDetails(targetGame.gameID);
          if (details && details.deals && details.deals.length > 0) {
            await this.updateExchangeRate();
            const gameSlug = gameNameService.toSlug(game.title);

            const prices: SavePriceInput[] = await Promise.all(details.deals.map(async (deal) => {
              const storeName = cheapSharkService.getStoreName(deal.storeID);
              const urlVal = await this.resolveDirectStoreUrl(storeName, deal.dealID, gameSlug, game.title, details.info.steamAppID);

              return {
                store: storeName,
                normalPrice: this.convertToKRWNumber(deal.retailPrice),
                salePrice: this.convertToKRWNumber(deal.price),
                discountPercent: Math.round(parseFloat(deal.savings)),
                url: urlVal
              };
            }));

            await dbService.saveGamePrices(game.id, prices);
            logger.info(`Updated prices in database for: ${game.title}`);
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.error(`Failed to update prices for ${game.title}: ${msg}`);
      }
      // Delay to respect rate limits
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

export const gameService = new GameService();
