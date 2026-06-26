import axios from "axios";

async function testHeaders() {
  const dealID = "nlp3qDJuphBKbhB375Uh1maMvh4fQqKur9BHFfgLZqI=";
  const redirectUrl = `https://www.cheapshark.com/redirect?dealID=${encodeURIComponent(dealID)}`;
  const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  try {
    const firstRes = await axios.get(redirectUrl, {
      headers: {
        "User-Agent": userAgent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "Connection": "keep-alive"
      }
    });

    const html = firstRes.data;
    const match = html.match(/href="(\/send\?target=[^"]+)"/);
    if (!match) {
      console.log("Failed to find target");
      return;
    }

    const sendUrl = `https://www.cheapshark.com${match[1]}`;
    console.log("Found send URL:", sendUrl);

    const secondRes = await axios.get(sendUrl, {
      headers: {
        "User-Agent": userAgent,
        "Referer": redirectUrl,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "Connection": "keep-alive",
        "sec-ch-ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1"
      },
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 400
    });

    console.log("Status:", secondRes.status);
    console.log("Location:", secondRes.headers.location);
  } catch (e: any) {
    if (e.response) {
      console.log("Error status:", e.response.status);
      console.log("Error headers:", e.response.headers);
    } else {
      console.error("Error:", e.message);
    }
  }
}

testHeaders();
