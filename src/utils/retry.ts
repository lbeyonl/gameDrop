import { logger } from "./logger.js";

export async function retry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 1000,
  backoffFactor = 2
): Promise<T> {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (error: unknown) {
      attempt++;
      if (attempt >= retries) {
        throw error;
      }
      const msg = error instanceof Error ? error.message : String(error);
      const delay = delayMs * Math.pow(backoffFactor, attempt - 1);
      logger.warn(`API call failed: ${msg}. Retrying in ${delay}ms... (Attempt ${attempt}/${retries})`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Retry failed");
}
