export default {
  name: "حماية",
  aliases: ["protect", "guard", "حمايه"],
  description: "حفظ اسم المجموعة وكنياتها أو إيقاف الاستعادة التلقائية",
  async execute({ args, send, threadId, runtime }) {
    const choice = args.trim().toLocaleLowerCase("ar");
    if (["حالة", "status"].includes(choice)) {
      const status = await runtime.protection.status(threadId);
      await send(
        status.enabled
          ? `الحماية مفعلة. آخر نسخة محفوظة: ${status.savedAt ?? "غير معروف"}.`
          : "الحماية متوقفة في هذه المجموعة.",
      );
      return;
    }
    if (["إيقاف", "ايقاف", "وقف", "off", "disable", "تعطيل"].includes(choice)) {
      const existed = await runtime.protection.disable(threadId);
      await send(existed ? "تم إيقاف الحماية." : "الحماية غير مفعلة في هذه المجموعة.");
      return;
    }

    if (!["", "تشغيل", "تفعيل", "on", "enable"].includes(choice)) {
      await send("استخدم: حماية تشغيل أو حماية إيقاف أو حماية حالة.");
      return;
    }
    const snapshot = await runtime.protection.enable(threadId);
    await send(
      `تم تفعيل الحماية وحفظ اسم المجموعة وكنياتها في Nike. تبدأ الاستعادة فورًا بعد أي تغيير. عدد الكنيات المحفوظة: ${Object.keys(snapshot.nicknames).length}.`,
    );
  },
};
