import { delay } from "../lib/messenger.js";
import {
  collectNicknameParticipants,
  nicknameAlreadyMatches,
} from "./nicknames.js";

export const CLEAR_NICKNAME_DELAY_MS = 15_000;

export default {
  name: "إزالة_الكنيات",
  aliases: [
    "ازالة_الكنيات",
    "مسح_الكنيات",
    "clear-nicknames",
    "cn",
  ],
  description: "إزالة كنيات جميع أعضاء المجموعة",
  async execute({ send, threadId, runtime, wait = delay }) {
    const info = await runtime.api.getThreadInfo(threadId);
    const botId = runtime.api.getCurrentUserID();
    const participants = collectNicknameParticipants(info, botId).filter(
      (participantId) => !nicknameAlreadyMatches(info, participantId, ""),
    );
    let cleared = 0;
    let failed = 0;
    for (const [index, participantId] of participants.entries()) {
      try {
        await runtime.api.nickname("", threadId, participantId);
        cleared += 1;
      } catch {
        failed += 1;
      }
      if (index < participants.length - 1) {
        await wait(CLEAR_NICKNAME_DELAY_MS);
      }
    }
    let protectionError = false;
    try {
      await runtime.protection.refreshFromCurrent(threadId);
    } catch {
      protectionError = true;
    }
    await send(
      `انتهى حذف الكنيات: تمت إزالة ${cleared}، تعذر ${failed}.${protectionError ? " تعذر تحديث نسخة الحماية." : ""}`,
    );
  },
};
