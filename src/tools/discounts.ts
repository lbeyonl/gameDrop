import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { gameService } from "../services/game.service.js";
import { discountsSchema } from "../schemas/toolSchemas.js";
import { handleToolError } from "../utils/errorHandler.js";

export function registerDiscountsTool(server: McpServer) {
  server.registerTool(
    "gameDropDiscounts",
    {
      title: "gameDropDiscounts",
      description: "현재 할인 중인 게임 조회 (platform: all | steam | epic | gog, minDiscount: 최소 할인율 %, limit: 가져올 개수)",
      inputSchema: discountsSchema,
      annotations: {
        title: "gameDropDiscounts",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
        idempotentHint: true
      }
    },
    async ({ platform, minDiscount, limit }) => {
      try {
        const games = await gameService.getDiscounts(platform, minDiscount, limit);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                games
              }, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(handleToolError(error, "gameDropDiscounts"), null, 2)
            }
          ]
        };
      }
    }
  );
}
