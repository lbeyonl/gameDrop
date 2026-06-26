import axios from "axios";

async function testApi() {
  const url = "https://www.cheapshark.com/redirect?dealID=nlp3qDJuphBKbhB375Uh1maMvh4fQqKur9BHFfgLZqI=";
  try {
    const res = await axios.post("https://www.redirectcheck.org/api/check", {
      urls: [url]
    });
    console.log("Response:", JSON.stringify(res.data, null, 2));
  } catch (e: any) {
    if (e.response) {
      console.log("Error status:", e.response.status);
      console.log("Error data:", e.response.data);
    } else {
      console.error("Error:", e.message);
    }
  }
}

testApi();
