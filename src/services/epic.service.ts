import axios from "axios";
import { FreeGame } from "../types/game.js";
import { logger } from "../utils/logger.js";
import { retry } from "../utils/retry.js";

export class EpicService {
  async getFreeGames(): Promise<FreeGame[]> {
    return retry(async () => {
      const url = "https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=ko-KR&country=KR&allowCountries=KR";
      const response = await axios.get(url, { timeout: 5000 });
      
      const elements = response.data?.data?.Catalog?.searchStore?.elements || [];
      const games: FreeGame[] = [];
      const now = new Date();
      
      for (const element of elements) {
        // Skip if it's not a free promotion
        const originalPrice = element.price?.totalPrice?.originalPrice || 0;
        const discountPrice = element.price?.totalPrice?.discountPrice || 0;
        
        let isFreeNow = originalPrice > 0 && discountPrice === 0;
        let startDate = "";
        let endDate = "";
        
        const promoOffers = element.promotions?.promotionalOffers || [];
        for (const group of promoOffers) {
          const offers = group.promotionalOffers || [];
          for (const offer of offers) {
            const start = new Date(offer.startDate);
            const end = new Date(offer.endDate);
            const isZeroPrice = offer.discountSetting?.discountValue === 0 && offer.discountSetting?.discountType === "PERCENTAGE";
            
            if (isZeroPrice && now >= start && now <= end) {
              isFreeNow = true;
              startDate = offer.startDate;
              endDate = offer.endDate;
              break;
            }
          }
          if (isFreeNow) break;
        }
        
        
        if (isFreeNow) {
          // catalogNs.mappings[0].pageSlug이 가장 신뢰할 수 있는 슬러그
          // productSlug은 "/home" 접미사가 붙는 경우가 있어 제거 필요
          // urlSlug은 랜덤 해시인 경우가 많아 fallback으로만 사용
          const pageSlug = element.catalogNs?.mappings?.[0]?.pageSlug;
          const offerSlug = element.offerMappings?.[0]?.pageSlug;
          const productSlugClean = element.productSlug?.replace(/\/home$/, "") || "";
          const slug = pageSlug || offerSlug || productSlugClean || "";
          
          // 랜덤 해시 형태의 slug 감지 (32자 hex → 신뢰 불가)
          const isRandomHash = /^[a-f0-9]{32}$/.test(slug);
          const gameUrl = (slug && !isRandomHash)
            ? `https://store.epicgames.com/ko/p/${slug}`
            : "https://store.epicgames.com/ko/free-games";
          
          const keyImages = element.keyImages || [];
          const thumbObj = keyImages.find((img: { type: string; url: string }) => 
            img.type === "Thumbnail" || 
            img.type === "BoxArt" || 
            img.type === "featuredMedia" || 
            img.type === "OfferImageWide"
          ) || keyImages[0];
          const thumbnail = thumbObj ? thumbObj.url : "";

          games.push({
            title: element.title,
            platform: "Epic Games",
            startDate: startDate || now.toISOString(),
            endDate: endDate || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            url: gameUrl,
            thumbnail
          });
        }
      }
      return games;
    }, 3, 1000, 2).catch((e: Error) => {
      logger.error("Epic Games Free Games API error (all retries failed): " + e.message);
      return [];
    });
  }
}

export const epicService = new EpicService();
