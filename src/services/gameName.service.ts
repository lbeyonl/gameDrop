import Fuse from "fuse.js";
import { dbService } from "./db.service.js";
import { logger } from "../utils/logger.js";

export interface GameMapping {
  title: string;
  localizedTitle: string;
  aliases: string[];
}

// Predefined translation dictionary
const PREDEFINED_MAPPINGS: GameMapping[] = [
  { title: "Monster Hunter Wilds", localizedTitle: "몬스터 헌터 와일즈", aliases: ["몬헌 와일드", "몬헌 와일즈", "몬헌"] },
  { title: "Elden Ring", localizedTitle: "엘든 링", aliases: ["엘든링", "엘든"] },
  { title: "Cyberpunk 2077", localizedTitle: "사이버펑크 2077", aliases: ["사이버펑크", "사펑", "사이버 펑크"] },
  { title: "The Witcher 3: Wild Hunt", localizedTitle: "더 위쳐 3: 와일드 헌트", aliases: ["위쳐3", "위쳐", "더 위쳐 3"] },
  { title: "Grand Theft Auto V", localizedTitle: "그랜드 테프트 오토 V", aliases: ["GTA5", "GTA", "지티에이5"] },
  { title: "Monster Hunter: World", localizedTitle: "몬스터 헌터: 월드", aliases: ["몬헌 월드"] },
  { title: "Hades II", localizedTitle: "하데스 2", aliases: ["하데스2"] },
  { title: "Hades", localizedTitle: "하데스", aliases: [] },
  { title: "Red Dead Redemption 2", localizedTitle: "레드 데드 리뎀션 2", aliases: ["레데리2", "레데리"] },
  { title: "Diablo IV", localizedTitle: "디아블로 4", aliases: ["디아4", "디아블로4"] },
  { title: "Palworld", localizedTitle: "팰월드", aliases: ["팔월드", "펠월드"] },
  { title: "Minecraft", localizedTitle: "마인크래프트", aliases: ["마크"] },
  { title: "Terraria", localizedTitle: "테라리아", aliases: [] },
  { title: "Stardew Valley", localizedTitle: "스타듀 밸리", aliases: ["스타듀밸리", "스듀"] },
  { title: "Hollow Knight", localizedTitle: "할로우 나이트", aliases: ["할나"] },
  { title: "Slay the Spire", localizedTitle: "슬레이 더 스파이어", aliases: ["슬더슬"] },
  { title: "Civilization VI", localizedTitle: "문명 6", aliases: ["문명6", "문명"] },
  { title: "Baldur's Gate 3", localizedTitle: "발더스 게이트 3", aliases: ["발게3", "발더스3"] },
  { title: "Cyberpunk 2077: Phantom Liberty", localizedTitle: "사이버펑크 2077: 팬텀 리버티", aliases: ["팬텀 리버티", "팬텀리버티"] }
];

export class GameNameService {
  /**
   * Slug 생성기 (영문 기준 소문자 및 하이픈 연결 형태)
   * 예: "Monster Hunter: Wilds" -> "monster-hunter-wilds"
   */
  toSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "") // 특수문자 제거
      .trim()
      .replace(/\s+/g, "-") // 공백을 하이픈으로 대체
      .replace(/-+/g, "-"); // 연속된 하이픈 방지
  }

  /**
   * 입력 게임명을 일관되게 정규화 (공백 정돈 및 소문자화)
   */
  normalizeGameName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9가-힣\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * DB에 등록된 실시간 게임 매핑 정보와 정적 매핑 정보를 병합하여 반환
   */
  async getMergedMappings(): Promise<GameMapping[]> {
    const list: GameMapping[] = [...PREDEFINED_MAPPINGS];
    
    // DB의 게임 데이터를 조회하여 동적 매핑 추가
    if (dbService.isConnected()) {
      try {
        const dbGames = await dbService.getAllGames();
        for (const dbGame of dbGames) {
          // 중복 방지 (이미 정적 딕셔너리에 있는 게임인 경우 패스)
          const exists = list.some(
            (m) => m.title.toLowerCase() === dbGame.title.toLowerCase()
          );
          if (!exists) {
            list.push({
              title: dbGame.title,
              localizedTitle: dbGame.localized_title || "",
              aliases: []
            });
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.warn(`Failed to fetch dynamic mappings from database: ${msg}`);
      }
    }
    return list;
  }

  /**
   * Fuse.js 기반 애칭, 오타 보정, 다국어 통합 검색 수행
   */
  async fuzzySearch(query: string): Promise<GameMapping | null> {
    const normalizedQuery = this.normalizeGameName(query);
    if (!normalizedQuery) return null;

    const mappings = await this.getMergedMappings();

    // Fuse.js 설정
    const fuse = new Fuse<GameMapping>(mappings, {
      keys: [
        { name: "localizedTitle", weight: 0.5 },
        { name: "title", weight: 0.3 },
        { name: "aliases", weight: 0.2 }
      ],
      threshold: 0.4, // 매치 정밀도 조절 (낮을수록 정확, 높을수록 유연)
      includeScore: true
    });

    const results = fuse.search(normalizedQuery);
    if (results.length > 0) {
      // 매칭 결과가 신뢰 수준에 만족할 때 반환
      return results[0].item;
    }
    return null;
  }

  /**
   * 한국어 게임명 입력 시 영문 매핑명 반환
   */
  async translateToEnglish(name: string): Promise<string> {
    const matched = await this.fuzzySearch(name);
    return matched ? matched.title : name;
  }

  /**
   * 영문 게임명 입력 시 한글 매핑명 반환
   */
  async translateToKorean(englishName: string): Promise<string> {
    const matched = await this.fuzzySearch(englishName);
    return matched && matched.localizedTitle ? matched.localizedTitle : englishName;
  }

  /**
   * 별칭 및 단축어 해결
   */
  async resolveAlias(name: string): Promise<string> {
    const matched = await this.fuzzySearch(name);
    return matched ? matched.title : name;
  }
}

export const gameNameService = new GameNameService();
