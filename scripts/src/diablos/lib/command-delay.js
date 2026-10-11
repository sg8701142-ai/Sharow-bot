import { delay } from "./messenger.js";

export const COMMAND_EXECUTION_DELAY_MS = 5_000;

export async function waitBeforeCommandExecution(wait = delay) {
  await wait(COMMAND_EXECUTION_DELAY_MS);
}
