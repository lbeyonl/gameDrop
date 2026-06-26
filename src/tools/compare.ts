import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { gameService } from "../services/game.service.js";
import { comparePriceSchema } from "../schemas/toolSchemas.js";
import { handleToolError } from "../utils/errorHandler.js";

export function registerCompareTool(server: McpServer) {
  server.registerTool(
    "gameDropComparePrice",
    {
      title: "gameDropComparePrice",
      description: "게임 가격 비교 및 최저가 조회 (title: 비교할 게임 타이틀 이름)",
      inputSchema: comparePriceSchema,
      annotations: {
        title: "gameDropComparePrice",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
        idempotentHint: true
      }
    },
    async ({ title }) => {
      try {
        const result = await gameService.comparePrice(title);
        if (!result) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  message: "해당 이름의 게임을 찾을 수 없거나 가격 정보가 없습니다."
                }, null, 2)
              }
            ]
          };
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                ...result
              }, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(handleToolError(error, "gameDropComparePrice"), null, 2)
            }
          ]
        };
      }
    }
  );
}
