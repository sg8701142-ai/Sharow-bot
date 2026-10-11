export default {
  name: "خروج",
  aliases: ["leave", "leave-group"],
  description: "إرسال طلب لإخراج البوت من المجموعة الحالية",
  async execute({ event, send, threadId, runtime }) {
    if (
      String(event?.senderID ?? "") !==
      String(runtime.config.developerId ?? "")
    ) {
      await send("هذا الأمر متاح للمطوّر الأساسي فقط.");
      return;
    }

    if (event?.isGroup !== true) {
      await send("استخدم هذا الأمر داخل المجموعة التي تريد أن يغادرها البوت.");
      return;
    }

    const groupId = String(threadId ?? "").trim();
    const botId = String(runtime.api.getCurrentUserID?.() ?? "").trim();
    if (!groupId || !botId || typeof runtime.api.gcmember !== "function") {
      await send("تعذر تجهيز طلب خروج البوت من المجموعة.");
      return;
    }

    try {
      const result = await runtime.api.gcmember("remove", botId, groupId);
      if (result?.type === "error_gc" || result?.error) {
        await send("تعذر إخراج البوت من المجموعة. تحقق من اتصال Messenger وحاول مجددًا.");
        return;
      }

      const confirmedRequest =
        result?.type === "gc_member_update" &&
        result.action === "remove" &&
        String(result.threadID ?? "") === groupId &&
        Array.isArray(result.userIDs) &&
        result.userIDs.some((userId) => String(userId) === botId);
      if (!confirmedRequest) {
        await send("لم يؤكد Messenger إرسال طلب خروج البوت من المجموعة.");
        return;
      }

      await send("أُرسل طلب خروج البوت من هذه المجموعة.");
    } catch {
      await send("تعذر إخراج البوت من المجموعة. تحقق من اتصال Messenger وحاول مجددًا.");
    }
  },
};
