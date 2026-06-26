import readline from "readline";
import dotenv from "dotenv";
dotenv.config();

import { gameService } from "./services/game.service.js";
import { dbService } from "./services/db.service.js";

async function main() {
  console.clear();
  console.log("\x1b[35m========================================================\x1b[0m");
  console.log("\x1b[36m    🎮 GameDrop MCP Local Interactive CLI Test Tool 🎮   \x1b[0m");
  console.log("\x1b[35m========================================================\x1b[0m");

  await dbService.initialize();
  console.log(`\n🔋 PostgreSQL DB 연결 상태: ${dbService.isConnected() ? "\x1b[32m연결됨 (Connected)\x1b[0m" : "\x1b[31m연결 실패 (Disconnected, Fallback 모드로 작동)\x1b[0m"}`);
  console.log("--------------------------------------------------------");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const ask = () => {
    console.log("\n\x1b[33m[원하는 작업을 선택해 주세요]\x1b[0m");
    console.log(" 1: 무료 게임 조회 (getFreeGames)");
    console.log(" 2: 할인 게임 조회 (getDiscounts)");
    console.log(" 3: 게임 검색 (searchGames)");
    console.log(" 4: 가격 비교 (comparePrice)");
    console.log(" 5: 상세 정보 조회 (getGameInfo)");
    console.log(" q: 종료");
    
    rl.question("\n선택 > ", async (answer) => {
      const choice = answer.trim();

      if (choice === "q" || choice === "quit" || choice === "exit") {
        console.log("\n👋 테스트 도구를 종료합니다!");
        rl.close();
        process.exit(0);
      }

      if (choice === "1") {
        rl.question("플랫폼 (epic / steam / gog / all) [all] > ", async (platform) => {
          const plat = platform.trim() || "all";
          console.log(`\n⏳ 무료 게임 조회 중... (${plat})`);
          try {
            const games = await gameService.getFreeGames(plat);
            console.log(`\n🎉 무료 게임 목록 (총 ${games.length}개):`);
            console.dir(games, { depth: null, colors: true });
          } catch (e: any) {
            console.error("\x1b[31m에러 발생:\x1b[0m", e.message);
          }
          ask();
        });
      } else if (choice === "2") {
        rl.question("플랫폼 (epic / steam / gog / all) [all] > ", async (platform) => {
          const plat = platform.trim() || "all";
          rl.question("최소 할인율 (%) [50] > ", async (minDisc) => {
            const disc = parseInt(minDisc.trim() || "50", 10);
            rl.question("출력 개수 제한 [5] > ", async (limitVal) => {
              const limit = parseInt(limitVal.trim() || "5", 10);
              console.log(`\n⏳ 할인 게임 조회 중... (플랫폼: ${plat}, 최소할인: ${disc}%, 제한: ${limit}개)`);
              try {
                const discounts = await gameService.getDiscounts(plat, disc, limit);
                console.log(`\n🏷️ 할인 게임 목록:`);
                console.dir(discounts, { depth: null, colors: true });
              } catch (e: any) {
                console.error("\x1b[31m에러 발생:\x1b[0m", e.message);
              }
              ask();
            });
          });
        });
      } else if (choice === "3") {
        rl.question("검색할 게임명 (예: 몬헌, 사펑, 엘든 링) > ", async (query) => {
          if (!query.trim()) {
            console.log("게임명을 입력해 주세요.");
            ask();
            return;
          }
          console.log(`\n⏳ 게임 검색 중... ("${query.trim()}")`);
          try {
            const results = await gameService.searchGames(query.trim());
            console.log(`\n🔍 검색 결과:`);
            console.dir(results, { depth: null, colors: true });
          } catch (e: any) {
            console.error("\x1b[31m에러 발생:\x1b[0m", e.message);
          }
          ask();
        });
      } else if (choice === "4") {
        rl.question("가격 비교할 게임명 (예: 몬헌, Cyberpunk) > ", async (query) => {
          if (!query.trim()) {
            console.log("게임명을 입력해 주세요.");
            ask();
            return;
          }
          console.log(`\n⏳ 가격 비교 정보 조회 중... ("${query.trim()}")`);
          try {
            const result = await gameService.comparePrice(query.trim());
            console.log(`\n📊 가격 비교 결과:`);
            console.dir(result, { depth: null, colors: true });
          } catch (e: any) {
            console.error("\x1b[31m에러 발생:\x1b[0m", e.message);
          }
          ask();
        });
      } else if (choice === "5") {
        rl.question("상세 정보 조회할 게임명 (예: 엘든 링, 사펑) > ", async (query) => {
          if (!query.trim()) {
            console.log("게임명을 입력해 주세요.");
            ask();
            return;
          }
          console.log(`\n⏳ 상세 정보 조회 중... ("${query.trim()}")`);
          try {
            const result = await gameService.getGameInfo(query.trim());
            console.log(`\nℹ️ 상세 정보 결과:`);
            console.dir(result, { depth: null, colors: true });
          } catch (e: any) {
            console.error("\x1b[31m에러 발생:\x1b[0m", e.message);
          }
          ask();
        });
      } else {
        console.log("올바른 옵션을 선택해 주세요.");
        ask();
      }
    });
  };

  ask();
}

main().catch(console.error);
