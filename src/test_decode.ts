import { Buffer } from "buffer";

function testDecode() {
  const targetEncoded = "YlwLgmZyOdiC4OtsNjO5dfOY+0r4DA0uBrEqGvUyrKnxkqKffAYq6yyXHpka6mni8l/sRstuRorJVo3mHrZ+PaKKqKRKCOuG7POWA8Latw0y6/9bkk60VUguEOmTAFDsQY3+tWK3ze3aYIdxrwmn8+2zCJLUtpPgEVLpZvAAoL4=";
  const decoded = Buffer.from(targetEncoded, "base64");
  console.log("Decoded string (UTF-8):", decoded.toString("utf-8"));
  console.log("Decoded string (Hex):", decoded.toString("hex"));
}

testDecode();
