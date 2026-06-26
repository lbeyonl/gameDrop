import { logger } from "./logger.js";

export function handleToolError(error: unknown, toolName: string) {
  const errMsg = error instanceof Error ? error.message : String(error);
  logger.error(`Error in tool ${toolName}: ${errMsg}`);
  if (error instanceof Error && error.stack) {
    logger.error(error.stack);
  }
  return {
    success: false,
    error: errMsg
  };
}
