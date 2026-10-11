export default {
  name: "حذف",
  aliases: ["sk", "delete", "del", "مسح_رسالة"],
  description: "حذف رسالة للبوت بالرد عليها",
  async execute({ event, send, runtime }) {
    const target = event?.messageReply;
    if (!target?.messageID) {
      await send("ردّ على رسالة أرسلها البوت واكتب «حذف» أو «sk».");
      return;
    }
    if (
      String(target.senderID ?? "") !==
      String(runtime.api.getCurrentUserID())
    ) {
      await send("يمكن حذف رسائل البوت فقط.");
      return;
    }
    if (typeof runtime.api.unsendMessage !== "function") {
      throw new Error("مكتبة Messenger لا تدعم حذف الرسائل في هذا الاتصال.");
    }
    await runtime.api.unsendMessage(target.messageID);
  },
};
