// ===== Core Domain Interfaces =====

export interface FreeGame {
  title: string;
  platform: string;
  startDate: string;
  endDate: string;
  url: string;
  thumbnail?: string;
}

export interface DiscountGame {
  title: string;
  discount: number;
  normalPrice: string;
  salePrice: string;
  store: string;
  url: string;
  thumbnail?: string;
}

export interface SearchGameResult {
  title: string;
  gameID: string;
  steamAppID: string | null;
  cheapestPrice: string;
  cheapestDealUrl: string;
  thumb: string;
}

export interface StorePrice {
  store: string;
  price: number;
  discount: number;
  url: string;
}

export interface GameCompareResult {
  title: string;
  stores: StorePrice[];
  bestDeal: {
    store: string;
    price: number;
    url: string;
  } | null;
}

export interface GameDetails {
  title: string;
  description: string;
  developer: string;
  publisher: string;
  releaseDate: string;
  genres: string[];
  price: string;
}

// ===== API Response Interfaces (MCP Tool 응답용) =====

export interface FreeGameResponse {
  title: string;
  localizedTitle: string;
  platform: string;
  startDate: string;
  endDate: string;
  url: string;
  source: "database" | "api" | "db_fallback";
  message?: string;
  thumbnail?: string;
}

export interface DiscountGameResponse {
  title: string;
  localizedTitle: string;
  discount: number;
  normalPrice: string;
  salePrice: string;
  store: string;
  url: string;
  source: "database" | "api" | "db_fallback";
  message?: string;
  thumbnail?: string;
}

export interface SearchGameResponse {
  title: string;
  localizedTitle: string;
  gameID: string;
  steamAppID: string;
  cheapestPrice: string;
  url: string;
  thumb: string;
  source: "database" | "api" | "db_fallback";
  message?: string;
}

export interface ComparePriceResponse {
  title: string;
  localizedTitle: string;
  stores: StorePrice[];
  bestDeal: {
    store: string;
    price: number;
    url: string;
  } | null;
  source: "database" | "api" | "db_fallback";
  message?: string;
}

export interface GameInfoResponse {
  title: string;
  localizedTitle: string;
  description: string;
  developer: string;
  publisher: string;
  releaseDate: string;
  genres: string[];
  price: string;
  source: "database" | "api" | "db_fallback";
  message?: string;
}

// ===== DB Row Mapping Interfaces =====

export interface DbGame {
  id: number;
  title: string;
  localized_title: string | null;
  slug: string;
  developer: string | null;
  publisher: string | null;
  release_date: string | null;
  steam_app_id: string | null;
  cheapshark_game_id: string | null;
  thumbnail: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbFreeGame {
  id: number;
  game_id: number;
  platform: string;
  start_date: string | null;
  end_date: string | null;
  url: string | null;
  // Joined fields from games table
  title: string;
  localized_title: string | null;
  slug?: string;
  developer?: string | null;
  publisher?: string | null;
  thumbnail?: string | null;
}

export interface DbGamePrice {
  id: number;
  game_id: number;
  store: string;
  normal_price: string; // NUMERIC comes as string from pg
  sale_price: string;
  discount_percent: number;
  url: string | null;
  last_checked_at: string;
  // Joined fields from games table
  title: string;
  localized_title: string | null;
  thumbnail?: string | null;
}

// ===== Internal Processing Interfaces =====

export interface SaveGameInput {
  title: string;
  localized_title?: string;
  slug: string;
  developer?: string;
  publisher?: string;
  release_date?: string;
  steam_app_id?: string;
  cheapshark_game_id?: string;
  thumbnail?: string;
}

export interface SavePriceInput {
  store: string;
  normalPrice: number;
  salePrice: number;
  discountPercent: number;
  url?: string;
}

export interface InternalDeal {
  title: string;
  discount: number;
  normalPrice: number;
  salePrice: number;
  store: string;
  url: string;
  thumbnail?: string;
  cheapshark_game_id?: string;
  steamAppID?: string | null;
  slug?: string;
}
