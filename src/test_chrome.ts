import { spawn } from "child_process";
import axios from "axios";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveViaChrome(dealID: string): Promise<string | null> {
  const redirectUrl = `https://www.cheapshark.com/redirect?dealID=${encodeURIComponent(dealID)}`;
  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const port = 9222;

  console.log("Launching headless Chrome...");
  const chromeProcess = spawn(chromePath, [
    `--remote-debugging-port=${port}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-blink-features=AutomationControlled",
    "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "--window-position=-32000,-32000",
    "--user-data-dir=./chrome-temp-profile",
    redirectUrl
  ]);

  try {
    // Wait for Chrome to launch and follow redirect
    console.log("Waiting 6 seconds for redirect to complete...");
    await delay(6000);

    // Query Chrome devtools list endpoint
    console.log("Querying Chrome DevTools target list...");
    const res = await axios.get(`http://127.0.0.1:${port}/json/list`, { timeout: 3000 });
    
    if (res.data && Array.isArray(res.data) && res.data.length > 0) {
      console.log("Targets found:", res.data);
      const target = res.data.find((t: any) => t.type === "page" && t.url !== "about:blank");
      if (target) {
        return target.url;
      }
    }
  } catch (err: any) {
    console.error("Error communicating with Chrome DevTools:", err.message);
  } finally {
    console.log("Terminating Chrome...");
    chromeProcess.kill();
  }

  return null;
}

async function test() {
  const dealID = "nlp3qDJuphBKbhB375Uh1maMvh4fQqKur9BHFfgLZqI="; // Humble Store link
  const url = await resolveViaChrome(dealID);
  console.log("Resolved URL:", url);
}

test();
