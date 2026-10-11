# Diablos Messenger Bot

بوت Node.js لإدارة أوامر المجموعات ومراقبة كنية حساب البوت على Messenger عبر `ws3-fca`.

## التشغيل

- `pnpm start` — تشغيل عامل البوت من جذر مساحة العمل.
- `pnpm --filter @workspace/scripts test` — اختبارات الأوامر والمحاكاة المحلية.
- `pnpm run typecheck` — فحص TypeScript لمساحة العمل.
- `pnpm run build` — فحص وبناء الحزم.

زر التشغيل في Replit يشغّل `cd Diablos-Facebook-Bot && pnpm start`. العامل لا يفتح منفذ ويب. يحتاج `FACEBOOK_DEVELOPER_ID` و`FACEBOOK_APPSTATE_JSON`؛ خزّن جلسة Facebook في Secrets/متغير سري، ولا تحفظها في Git. يمنع قفل في مجلد البيانات تشغيل جلستين على الجهاز أو وحدة التخزين نفسها. يستطيع `DIABLOS_DATA_DIR` نقل حالة البوت ونسخ الحماية والقفل إلى مجلد دائم على استضافات مثل Railway.

## Railway

- ملف التشغيل الظاهر هو `railway.json`، ويشغّل العامل بالأمر `pnpm start` من جذر `Diablos-Facebook-Bot`.
- إذا كان المستودع يحتوي مجلدًا أعلى، اضبط Railway Root Directory على `/Diablos-Facebook-Bot` وملف الإعداد على `/Diablos-Facebook-Bot/railway.json`.
- انشره كعامل Background Worker؛ لا يحتاج إلى منفذ ويب.
- استخدم نسخة خدمة واحدة فقط؛ يحدد `railway.json` عدد النسخ إلى `1` لتجنب فتح جلستين.
- أضف `FACEBOOK_DEVELOPER_ID` و`FACEBOOK_APPSTATE_JSON` إلى متغيرات الخدمة في Railway، ولا ترفع `appstate.json` إلى Git.
- اربط Volume بمسار مثل `/data`. يكتشف البوت `RAILWAY_VOLUME_MOUNT_PATH` تلقائيًا لحفظ الإعدادات ونسخ الحماية.

أوامر البوت تعمل داخل المجموعات فقط، ومن حساب المطوّر المحدد في `FACEBOOK_DEVELOPER_ID`، ويجب أن تبدأ بالبادئة الحالية (الافتراضية `!`).
ينتظر البوت 5 ثوانٍ قبل تنفيذ الأمر. عند بدء `!بيس` أو `!devil` يرسل نص التكرار وتحته سطر الإيقاف، ثم يرسل النص وحده في الدورات التالية. الحماية تبدأ استعادة اسم المجموعة وكنياتها فور رصد التغيير.
الأمر `!إعادة` أو `!reset` يحذف ملفات نسخ الحماية من `Nike` لكل المجموعات، وهو متاح للمطوّر الأساسي فقط. يلغي الاستعادات المعلّقة؛ أعد تفعيل الحماية لإنشاء نسخ جديدة.
الأمر `!خروج` أو `!leave` يرسل طلبًا لإخراج حساب البوت من المجموعة الحالية، وهو متاح للمطوّر الأساسي فقط ويجب تشغيله من داخل المجموعة المقصودة.

## البنية

- `scripts/src/diablos/index.js` — اتصال Messenger، تحميل الأوامر ومعالجة الأحداث.
- `scripts/src/diablos/cmd/` — وحدات الأوامر.
- `scripts/src/diablos/lib/` — إعداد الجلسة والحالة والحماية والكنية الثابتة.
- `scripts/src/diablos/data/` و`Nike/` — حالة محلية ونسخ الحماية، مستثناة من Git.
- `artifacts/api-server/` و`artifacts/mockup-sandbox/` — خدمتا API ومعاينة مكونات، منفصلتان عن عامل Messenger.

تظل صلاحيات المنصة نفسها سارية؛ إزالة فحص المشرف من الكود لا تجعل Facebook يقبل عملية يرفضها حساب البوت.
