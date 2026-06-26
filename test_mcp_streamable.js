import http from "node:http";

function post(url, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers
        }
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data
          });
        });
      }
    );
    req.on("error", reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  console.log("=== 1. Sending POST initialize request ===");
  const initBody = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "test-client",
        version: "1.0.0"
      }
    }
  };

  const initRes = await post(
    "http://localhost:3000/mcp",
    {
      "Accept": "application/json, text/event-stream"
    },
    initBody
  );

  console.log("Initialize Status:", initRes.statusCode);
  console.log("Initialize Headers:", JSON.stringify(initRes.headers, null, 2));
  console.log("Initialize Body:\n", initRes.body);

  const sessionId = initRes.headers["mcp-session-id"];
  if (!sessionId) {
    console.error("FAIL: mcp-session-id header not found in initialize response!");
    process.exit(1);
  }
  console.log(`\nSUCCESS: Captured Session ID: ${sessionId}\n`);

  console.log("=== 2. Sending tools/list request ===");
  const toolsBody = {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {}
  };

  const toolsRes = await post(
    "http://localhost:3000/mcp",
    {
      "Accept": "application/json, text/event-stream",
      "mcp-session-id": sessionId,
      "mcp-protocol-version": "2024-11-05"
    },
    toolsBody
  );

  console.log("Tools List Status:", toolsRes.statusCode);
  console.log("Tools List Headers:", JSON.stringify(toolsRes.headers, null, 2));
  console.log("Tools List Body:\n", toolsRes.body);

  try {
    const lines = toolsRes.body.split("\n");
    const dataLine = lines.find(l => l.startsWith("data: "));
    if (dataLine) {
      const jsonStr = dataLine.substring(6);
      const parsed = JSON.parse(jsonStr);
      console.log("\n=== Verified Tools List (JSON) ===");
      console.log(JSON.stringify(parsed, null, 2));
    } else {
      console.error("FAIL: Could not extract data from tools list SSE response");
    }
  } catch (err) {
    console.error("Error parsing tools response:", err.message);
  }
}

run().catch(console.error);
