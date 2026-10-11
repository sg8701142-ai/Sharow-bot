function normalizeId(value) {
  const id = String(value ?? "").trim();
  return /^\d+$/.test(id) ? id : null;
}

export function resolveDeveloperTarget(event) {
  const repliedId = normalizeId(event?.messageReply?.senderID);
  if (repliedId) return repliedId;

  const mentions = event?.mentions;
  if (!mentions || typeof mentions !== "object") return null;
  const ids = Object.keys(mentions).map(normalizeId).filter(Boolean);
  return ids.length === 1 ? ids[0] : null;
}

export default {
  name: "مطور",
  aliases: ["gr", "developer", "add-developer"],
  description: "إضافة مطوّر بالرد على رسالته أو بمنشنه",
  async execute({ event, send, runtime }) {
    if (String(event?.senderID ?? "") !== runtime.config.developerId) {
      await send("هذا الأمر متاح للمطوّر الأساسي فقط.");
      return;
    }

    const targetId = resolveDeveloperTarget(event);
    if (!targetId) {
      await send("ردّ على رسالة الشخص أو اعمل له منشن لإضافته مطوّرًا.");
      return;
    }
    if (targetId === String(runtime.api.getCurrentUserID())) {
      await send("حساب البوت لا يمكن إضافته كمطوّر.");
      return;
    }

    const added = await runtime.state.addDeveloper(targetId);
    await send(added ? "تمت إضافة المطوّر." : "هذا الحساب مطوّر بالفعل.");
  },
};
