import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { gameService } from "../services/game.service.js";
import { searchSchema } from "../schemas/toolSchemas.js";
import { handleToolError } from "../utils/errorHandler.js";

export function registerSearchTool(server: McpServer) {
  server.registerTool(
    "gameDropSearch",
    {
      title: "gameDropSearch",
      description: "게임명으로 게임 검색 (keyword: 검색할 게임 키워드)",
      inputSchema: searchSchema,
      annotations: {
        title: "gameDropSearch",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
        idempotentHint: true
      }
    },
    async ({ keyword }) => {
      try {
        const games = await gameService.searchGames(keyword);
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
              text: JSON.stringify(handleToolError(error, "gameDropSearch"), null, 2)
            }
          ]
        };
      }
    }
  );
}
