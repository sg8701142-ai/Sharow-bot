export default {
  name: "إعادة",
  aliases: ["reset"],
  description: "حذف كل نسخ حماية المجموعات المحفوظة في Nike",
  async execute({ event, send, runtime }) {
    if (
      String(event?.senderID ?? "") !==
      String(runtime.config.developerId ?? "")
    ) {
      await send("هذا الأمر متاح للمطوّر الأساسي فقط.");
      return;
    }

    try {
      const { deleted, failed } =
        await runtime.protection.clearAllBackups();
      if (failed > 0) {
        await send(
          `حُذف ${deleted} ملفًا من نسخ الحماية، وتعذر حذف ${failed}. أعد المحاولة.`,
        );
        return;
      }
      if (deleted === 0) {
        await send("لا توجد نسخ حماية لحذفها من Nike.");
        return;
      }

      await send(
        `تم حذف ${deleted} ملفًا من نسخ الحماية لكل المجموعات في Nike. فعّل الحماية مجددًا لإنشاء نسخ جديدة.`,
      );
    } catch {
      await send("تعذر حذف نسخ الحماية. راجع سجل البوت ثم أعد المحاولة.");
    }
  },
};
