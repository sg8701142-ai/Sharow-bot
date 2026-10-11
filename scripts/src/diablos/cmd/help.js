export function formatHelp(prefix = "!") {
  return [
    "🤖 الأوامر:",
    "",
    `🔹 ${prefix}مساعدة / ${prefix}help / ${prefix}h`,
    `🔹 ${prefix}بادئة / ${prefix}prefix / ${prefix}p`,
    `🔹 ${prefix}uptime / ${prefix}حالة / ${prefix}u`,
    `🔹 ${prefix}بيس / ${prefix}base / ${prefix}b`,
    `🔹 ${prefix}devil / ${prefix}شيطان / ${prefix}d`,
    `🔹 ${prefix}اسم / ${prefix}name / ${prefix}n`,
    `🔹 ${prefix}كنيات / ${prefix}nicknames / ${prefix}nk`,
    `🔹 ${prefix}إزالة_الكنيات / ${prefix}clear-nicknames / ${prefix}cn`,
    `🔹 ${prefix}حماية / ${prefix}protect`,
    `🔹 ${prefix}إعادة / ${prefix}reset`,
    `🔹 ${prefix}خروج / ${prefix}leave`,
    `🔹 ${prefix}مطور / ${prefix}gr`,
    `🔹 ${prefix}حذف_مطور / ${prefix}ungr`,
    `🔹 ${prefix}حذف / ${prefix}sk`,
  ].join("\n");
}

export default {
  name: "مساعدة",
  aliases: ["help", "اوامر", "أوامر", "h"],
  description: "عرض قائمة الأوامر بالعربية والإنجليزية",
  async execute({ send, prefix }) {
    await send(formatHelp(prefix));
  },
};
