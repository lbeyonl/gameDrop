import dotenv from "dotenv";
dotenv.config();

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import Fastify from "fastify";
import fs from "fs";
import path from "path";

import { registerFreeGamesTool } from "./tools/freeGames.js";
import { registerDiscountsTool } from "./tools/discounts.js";
import { registerSearchTool } from "./tools/search.js";
import { registerCompareTool } from "./tools/compare.js";
import { registerGameInfoTool } from "./tools/gameInfo.js";
import { logger } from "./utils/logger.js";
import { dbService } from "./services/db.service.js";
import { schedulerService } from "./services/scheduler.service.js";
import { gameService } from "./services/game.service.js";

// 1. 데이터베이스 및 스케줄러 기동
await dbService.initialize();
schedulerService.start();

// 2. MCP 서버 초기화
const server = new McpServer({
  name: "gamedrop-mcp",
  version: "1.0.0"
});

// 3. 도구(Tools) 등록
registerFreeGamesTool(server);
registerDiscountsTool(server);
registerSearchTool(server);
registerCompareTool(server);
registerGameInfoTool(server);

// 4. 환경 변수 및 인자 분석을 통해 트랜스포트 설정
const isStdio = process.argv.includes("--transport=stdio") || process.env.TRANSPORT === "stdio";

if (isStdio) {
  // stdio 모드로 구동 (Claude Desktop, 로컬 CLI 테스트 등)
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("GameDrop MCP Server started in stdio mode");
} else {
  // SSE 모드로 구동 (카카오 PlayMCP, ChatGPT MCP 등)
  const port = parseInt(process.env.PORT || "3000", 10);
  const fastify = Fastify({ logger: false });
  const transports = new Map<string, SSEServerTransport>();

  // Web UI 대시보드 렌더링 엔드포인트
  fastify.get("/", async (_request, reply) => {
    try {
      const htmlPath = path.join(process.cwd(), "src", "dashboard.html");
      const html = await fs.promises.readFile(htmlPath, "utf-8");
      return reply.type("text/html").send(html);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.status(500).send(`Failed to load dashboard.html: ${msg}`);
    }
  });

  fastify.get("/dashboard", async (_request, reply) => {
    try {
      const htmlPath = path.join(process.cwd(), "src", "dashboard.html");
      const html = await fs.promises.readFile(htmlPath, "utf-8");
      return reply.type("text/html").send(html);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.status(500).send(`Failed to load dashboard.html: ${msg}`);
    }
  });

  // Health check 엔드포인트
  fastify.get("/health", async (_request, reply) => {
    return reply.status(200).send({
      status: "ok",
      service: "gamedrop-mcp",
      database: dbService.isConnected() ? "connected" : "disconnected"
    });
  });

  // REST API: DB 캐시 통계 및 연결 상태 조회
  fastify.get("/api/db-status", async (_request, reply) => {
    const connected = dbService.isConnected();
    let gamesCount = 0;
    let pricesCount = 0;
    let freeGamesCount = 0;
    if (connected) {
      try {
        const gamesRes = await dbService.query("SELECT COUNT(*) FROM games");
        const pricesRes = await dbService.query("SELECT COUNT(*) FROM game_prices");
        const freeRes = await dbService.query("SELECT COUNT(*) FROM free_games");
        gamesCount = parseInt((gamesRes.rows[0] as { count: string }).count, 10);
        pricesCount = parseInt((pricesRes.rows[0] as { count: string }).count, 10);
        freeGamesCount = parseInt((freeRes.rows[0] as { count: string }).count, 10);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.warn(`Failed to fetch counts from database: ${msg}`);
      }
    }
    return reply.send({
      connected,
      gamesCount,
      pricesCount,
      freeGamesCount
    });
  });

  // REST API: 무료 게임 조회
  fastify.get("/api/free-games", async (request, reply) => {
    const { platform } = request.query as { platform?: string };
    const plat = platform || "all";
    const games = await gameService.getFreeGames(plat);
    return reply.send(games);
  });

  // REST API: 할인 게임 조회
  fastify.get("/api/discounts", async (request, reply) => {
    const { platform, minDiscount, limit } = request.query as { platform?: string, minDiscount?: string, limit?: string };
    const plat = platform || "all";
    const minDisc = parseInt(minDiscount || "50", 10);
    const lim = parseInt(limit || "10", 10);
    const discounts = await gameService.getDiscounts(plat, minDisc, lim);
    return reply.send(discounts);
  });

  // REST API: 게임 검색
  fastify.get("/api/search", async (request, reply) => {
    const { keyword } = request.query as { keyword?: string };
    if (!keyword) {
      return reply.status(400).send({ error: "Missing keyword parameter" });
    }
    const results = await gameService.searchGames(keyword);
    return reply.send(results);
  });

  // REST API: 가격 비교
  fastify.get("/api/compare", async (request, reply) => {
    const { title } = request.query as { title?: string };
    if (!title) {
      return reply.status(400).send({ error: "Missing title parameter" });
    }
    const result = await gameService.comparePrice(title);
    return reply.send(result);
  });

  // REST API: 상세 정보
  fastify.get("/api/info", async (request, reply) => {
    const { title } = request.query as { title?: string };
    if (!title) {
      return reply.status(400).send({ error: "Missing title parameter" });
    }
    const result = await gameService.getGameInfo(title);
    return reply.send(result);
  });

  // REST API: 백그라운드 수동 동기화 요청
  fastify.post("/api/sync", async (_request, reply) => {
    if (!dbService.isConnected()) {
      return reply.status(400).send({ error: "Database not connected. Cannot sync." });
    }
    gameService.syncFreeGames().catch(e => logger.error(`Manual free games sync failed: ${e.message}`));
    gameService.syncAllPrices().catch(e => logger.error(`Manual price sync failed: ${e.message}`));
    return reply.send({ status: "sync_started", message: "Background sync triggered successfully." });
  });

  // SSE 연결 설립 엔드포인트
  fastify.get("/sse", async (request, reply) => {
    logger.info("New SSE client connection request received");
    reply.hijack();

    const rawRes = reply.raw;
    // SSE 전송 채널 생성 (클라이언트는 메시지 수신 후 /messages로 POST 요청을 보냄)
    const transport = new SSEServerTransport("/messages", rawRes);
    
    const sessionId = transport.sessionId;
    transports.set(sessionId, transport);
    logger.info(`SSE client session established: ${sessionId}`);

    rawRes.on("close", () => {
      logger.info(`SSE client session closed: ${sessionId}`);
      transports.delete(sessionId);
      transport.close().catch((err) => {
        logger.error(`Error closing SSE transport: ${err.message}`);
      });
    });

    await server.connect(transport);
  });

  // 메시지 수신 엔드포인트
  fastify.post("/messages", async (request, reply) => {
    const sessionId = (request.query as { sessionId?: string }).sessionId;
    if (!sessionId) {
      reply.status(400).send({ error: "Missing sessionId query parameter" });
      return;
    }

    const transport = transports.get(sessionId);
    if (!transport) {
      reply.status(404).send({ error: `No active SSE session found for ID: ${sessionId}` });
      return;
    }

    // Fastify가 이미 바디를 파싱했으므로 파싱된 바디(request.body)를 세 번째 인자로 함께 전달
    await transport.handlePostMessage(request.raw, reply.raw, request.body as Record<string, unknown>);
  });

  // 서버 바인딩 및 시작
  fastify.listen({ port, host: "0.0.0.0" }, (err, address) => {
    if (err) {
      logger.error(`Failed to start Fastify server: ${err.message}`);
      process.exit(1);
    }
    logger.info(`GameDrop MCP Server listening in SSE mode at ${address}`);
  });
}

// Graceful shutdown 처리
const shutdown = async () => {
  logger.info("Shutting down GameDrop MCP Server gracefully...");
  schedulerService.stop();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
