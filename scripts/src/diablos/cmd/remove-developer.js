import { resolveDeveloperTarget } from "./developer.js";

export default {
  name: "حذف_مطور",
  aliases: ["إزالة_مطور", "ungr", "remove-developer", "rmdev"],
  description: "إزالة مطوّر بالرد على رسالته أو بمنشنه",
  async execute({ event, send, runtime }) {
    if (String(event?.senderID ?? "") !== runtime.config.developerId) {
      await send("هذا الأمر متاح للمطوّر الأساسي فقط.");
      return;
    }

    const targetId = resolveDeveloperTarget(event);
    if (!targetId) {
      await send("ردّ على رسالة الشخص أو اعمل له منشن لإزالته من المطوّرين.");
      return;
    }
    if (targetId === String(runtime.api.getCurrentUserID())) {
      await send("لا يمكن إزالة حساب البوت من المطوّرين.");
      return;
    }

    try {
      const removed = await runtime.state.removeDeveloper(targetId);
      await send(
        removed
          ? "تمت إزالة المطوّر."
          : "هذا الحساب ليس ضمن المطوّرين أو لا يمكن إزالته.",
      );
    } catch {
      await send("لا يمكن إزالة المطوّر الأساسي.");
    }
  },
};
