import cron from "node-cron";
import { logger } from "../utils/logger.js";
import { gameService } from "./game.service.js";

export class SchedulerService {
  private tasks: cron.ScheduledTask[] = [];

  start(): void {
    logger.info("Initializing background scheduler...");

    // 서버 시작 시 초기 데이터 워밍업 (30초 후 비동기 실행)
    setTimeout(() => {
      logger.info("Starting initial data warmup...");
      gameService.syncFreeGames()
        .then(() => logger.info("Initial free games warmup completed"))
        .catch((e: Error) => logger.warn(`Initial free games warmup failed (non-blocking): ${e.message}`));
    }, 30_000);

    // 1. 무료 게임 자동 수집 (매 12시간: 00:00, 12:00)
    // 크론 패턴: '0 0,12 * * *' (매일 0시 및 12시 정각)
    const freeGamesTask = cron.schedule("0 0,12 * * *", async () => {
      logger.info("Scheduled task: Syncing free games...");
      try {
        await gameService.syncFreeGames();
        logger.info("Scheduled task: Free games sync completed successfully");
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.error(`Scheduled task failed (Free games sync): ${msg}`);
      }
    });
    this.tasks.push(freeGamesTask);

    // 2. 인기 게임 가격 갱신 (매 3시간: 00:00, 03:00, 06:00, ...)
    // 크론 패턴: '0 */3 * * *' (매 3시간 정각)
    const priceUpdateTask = cron.schedule("0 */3 * * *", async () => {
      logger.info("Scheduled task: Updating database game prices...");
      try {
        await gameService.syncAllPrices();
        logger.info("Scheduled task: Game prices update completed successfully");
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.error(`Scheduled task failed (Game prices update): ${msg}`);
      }
    });
    this.tasks.push(priceUpdateTask);

    logger.info("Background scheduler started successfully");
  }

  stop(): void {
    this.tasks.forEach((t) => t.stop());
    this.tasks = [];
    logger.info("Background scheduler stopped");
  }
}

export const schedulerService = new SchedulerService();
