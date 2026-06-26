import http2 from "http2";
import { URL } from "url";

function resolveHttp2(targetUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const parsed = new URL(targetUrl);
    const client = http2.connect(`https://${parsed.host}`);

    client.on("error", (err) => {
      console.error("HTTP/2 Client Error:", err.message);
      resolve(null);
    });

    const req = client.request({
      ":method": "GET",
      ":path": parsed.pathname + parsed.search,
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      "referer": "https://www.cheapshark.com/redirect?dealID=nlp3qDJuphBKbhB375Uh1maMvh4fQqKur9BHFfgLZqI%3D"
    });

    let status = 0;
    let location: string | null = null;
    let headers: any = {};

    req.on("response", (resHeaders) => {
      status = resHeaders[":status"] ? parseInt(resHeaders[":status"].toString()) : 0;
      location = (resHeaders["location"] as string) || null;
      headers = resHeaders;
    });

    req.on("data", () => {});

    req.on("end", () => {
      console.log("HTTP/2 Status:", status);
      console.log("HTTP/2 Location:", location);
      console.log("HTTP/2 Headers:", headers);
      client.close();
      resolve(location);
    });
  });
}

async function test() {
  const target = "https://www.cheapshark.com/send?target=YlwLgmZyOdiC4OtsNjO5dfOY%252B0r4DA0uBrEqGvUyrKnxkqKffAYq6yyXHpka6mni8l%252FsRstuRorJVo3mHrZ%252BPaKKqKRKCOuG7POWA8Latw0y6%252F9bkk60VUguEOmTAFDsQY3%252BtWK3ze3aYIdxrwmn8%252B2zCJLUtpPgEVLpZvAAoL4%253D";
  await resolveHttp2(target);
}

test();
