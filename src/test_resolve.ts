import { gameService } from "./services/game.service.js";

async function testResolution() {
  console.log("=== 1. Testing Epic Free Games ===");
  try {
    const epicFree = await gameService.getFreeGames("epic");
    console.log(`Fetched ${epicFree.length} Epic Free Games:`);
    epicFree.forEach((g, idx) => {
      console.log(`[Epic Free ${idx + 1}] - Title: ${g.title}, Platform: ${g.platform}, URL: ${g.url}`);
    });
  } catch (e: any) {
    console.error("Epic Free Games failed:", e.message);
  }

  console.log("\n=== 2. Testing Steam Free Games ===");
  try {
    const steamFree = await gameService.getFreeGames("steam");
    console.log(`Fetched ${steamFree.length} Steam Free Games:`);
    steamFree.forEach((g, idx) => {
      console.log(`[Steam Free ${idx + 1}] - Title: ${g.title}, Platform: ${g.platform}, URL: ${g.url}`);
    });
  } catch (e: any) {
    console.error("Steam Free Games failed:", e.message);
  }

  console.log("\n=== 3. Testing Epic Discounts ===");
  try {
    const epicDiscounts = await gameService.getDiscounts("epic", 10, 3);
    console.log(`Fetched ${epicDiscounts.length} Epic Deals:`);
    epicDiscounts.forEach((d, idx) => {
      console.log(`[Epic Deal ${idx + 1}] - Title: ${d.title}, Store: ${d.store}, Discount: ${d.discount}%, URL: ${d.url}`);
    });
  } catch (e: any) {
    console.error("Epic Discounts failed:", e.message);
  }

  console.log("\n=== 4. Testing Steam Discounts ===");
  try {
    const steamDiscounts = await gameService.getDiscounts("steam", 40, 3);
    console.log(`Fetched ${steamDiscounts.length} Steam Deals:`);
    steamDiscounts.forEach((d, idx) => {
      console.log(`[Steam Deal ${idx + 1}] - Title: ${d.title}, Store: ${d.store}, Discount: ${d.discount}%, URL: ${d.url}`);
    });
  } catch (e: any) {
    console.error("Steam Discounts failed:", e.message);
  }

  console.log("\n=== 5. Testing Combined Discounts (Steam + Epic) ===");
  try {
    const combinedDiscounts = await gameService.getDiscounts("all", 30, 5);
    console.log(`Fetched ${combinedDiscounts.length} Combined Deals:`);
    combinedDiscounts.forEach((d, idx) => {
      console.log(`[Combined Deal ${idx + 1}] - Title: ${d.title}, Store: ${d.store}, Discount: ${d.discount}%, URL: ${d.url}`);
    });
  } catch (e: any) {
    console.error("Combined Discounts failed:", e.message);
  }
}

testResolution();
