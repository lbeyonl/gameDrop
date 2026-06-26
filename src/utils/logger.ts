const isStdio = process.argv.includes("--transport=stdio") || process.env.TRANSPORT === "stdio";

export const logger = {
  info: (msg: string) => {
    if (isStdio) {
      process.stderr.write(`[INFO] ${msg}\n`);
    } else {
      console.log(`[INFO] ${msg}`);
    }
  },
  warn: (msg: string) => {
    if (isStdio) {
      process.stderr.write(`[WARN] ${msg}\n`);
    } else {
      console.warn(`[WARN] ${msg}`);
    }
  },
  error: (msg: string) => {
    if (isStdio) {
      process.stderr.write(`[ERROR] ${msg}\n`);
    } else {
      console.error(`[ERROR] ${msg}`);
    }
  }
};
