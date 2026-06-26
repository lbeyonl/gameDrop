import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { gameService } from "../services/game.service.js";
import { freeGamesSchema } from "../schemas/toolSchemas.js";
import { handleToolError } from "../utils/errorHandler.js";

export function registerFreeGamesTool(server: McpServer) {
  server.registerTool(
    "gameDropFreeGames",
    {
      title: "gameDropFreeGames",
      description: "현재 무료 배포 중인 게임 조회 (platform: all | steam | epic | gog)",
      inputSchema: freeGamesSchema,
      annotations: {
        title: "gameDropFreeGames",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
        idempotentHint: true
      }
    },
    async ({ platform }) => {
      try {
        const games = await gameService.getFreeGames(platform);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                count: games.length,
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
              text: JSON.stringify(handleToolError(error, "gameDropFreeGames"), null, 2)
            }
          ]
        };
      }
    }
  );
}
