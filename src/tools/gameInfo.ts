import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { gameService } from "../services/game.service.js";
import { gameInfoSchema } from "../schemas/toolSchemas.js";
import { handleToolError } from "../utils/errorHandler.js";

export function registerGameInfoTool(server: McpServer) {
  server.tool(
    "gameDropGameInfo",
    "게임 상세 정보 조회 (title: 상세 조회할 게임 타이틀 이름)",
    gameInfoSchema,
    async ({ title }) => {
      try {
        const details = await gameService.getGameInfo(title);
        if (!details) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  message: "해당 이름의 게임 상세 정보를 찾을 수 없습니다."
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
                ...details
              }, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(handleToolError(error, "gameDropGameInfo"), null, 2)
            }
          ]
        };
      }
    }
  );
}
