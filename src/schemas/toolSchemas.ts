import { z } from "zod";

// NOTE: GOG 지원은 실제 API 연동이 구현될 때 다시 추가 예정
export const freeGamesSchema = {
  platform: z.enum(["all", "steam", "epic"]).default("all")
};

export const discountsSchema = {
  platform: z.enum(["all", "steam", "epic"]).default("all"),
  minDiscount: z.number().min(0).max(100).default(50),
  limit: z.number().min(1).max(100).default(20)
};

export const searchSchema = {
  keyword: z.string().min(1)
};

export const comparePriceSchema = {
  title: z.string().min(1)
};

export const gameInfoSchema = {
  title: z.string().min(1)
};
