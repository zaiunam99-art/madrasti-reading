# نشر منصة مدرستي على Cloudflare Pages

## ربط الموقع
1. افتح Cloudflare Dashboard ثم Workers & Pages.
2. أنشئ Pages project واربط GitHub والمستودع `zaiunam99-art/madrasti-reading`.
3. اختر الفرع `main`.
4. Framework preset: None.
5. Build command: اتركه فارغاً.
6. Build output directory: `/` أو `.` إذا لم تقبل الواجهة الشرطة.
7. ابدأ النشر. ملف `index.html` موجود في جذر المستودع.

## ما أُضيف إلى المستودع
- `functions/api/health.js`: نقطة فحص API على المسار `/api/health`.
- `migrations/0001_initial.sql`: مخطط أولي لقاعدة Cloudflare D1.
- `manifest.webmanifest` و`sw.js` و`icon.svg`: أساس تثبيت الموقع كتطبيق ويب ودعم غلاف دون اتصال.
- واجهة `index.html` مرتبطة الآن بملف manifest ومسجل الخدمة.

## إعداد D1 (يحتاج تدخلك داخل حساب Cloudflare)
1. افتح Workers & Pages ثم D1 وأنشئ قاعدة باسم `madrasti-db`.
2. افتح Console الخاصة بالقاعدة ونفّذ SQL الموجود في `migrations/0001_initial.sql`.
3. افتح Pages project ثم Settings ثم Functions ثم D1 database bindings.
4. أضف binding باسم `DB` واربط قاعدة `madrasti-db`.
5. أعد نشر المشروع.
6. افتح `/api/health` وتحقق أن قيمة database أصبحت connected.

## تخزين الكتب لاحقاً
أنشئ R2 bucket باسم `madrasti-books` وأضف binding باسم `BOOKS` إلى Pages Functions بعد كتابة API الرفع الآمن.

## تنبيه أمني
الواجهة الحالية نموذج تجريبي. لا توجد بعد مصادقة حقيقية أو واجهات API لملفات الأبناء والتقدم أو رفع الكتب. بيانات النموذج محفوظة محلياً في المتصفح ويمكن فقدها عند حذف بيانات الموقع. لا تستخدم بيانات أطفال حقيقية أو ترفع كتباً خاصة قبل تنفيذ المصادقة وعزل صلاحيات الأسر والتحقق من الملفات. لا تضع كلمات مرور أو مفاتيح API في المستودع.


## واجهات الحساب التي أُضيفت برمجياً
بعد تنفيذ ترحيل D1 وإضافة binding باسم `DB`، تتوفر المسارات التالية:
- `POST /api/auth/register`: إنشاء حساب ولي أمر.
- `POST /api/auth/login`: تسجيل الدخول وإنشاء جلسة آمنة في Cookie.
- `GET /api/auth/me`: التحقق من الجلسة الحالية.
- `POST /api/auth/logout`: إنهاء الجلسة.
- `GET /api/children`: عرض ملفات أبناء ولي الأمر الحالي.
- `POST /api/children`: إنشاء ملف طفل.
- `PATCH /api/children/:id`: تعديل ملف طفل يملكه ولي الأمر.
- `DELETE /api/children/:id`: حذف ملف طفل يملكه ولي الأمر.

كلمات المرور تُخزّن باستخدام PBKDF2 عبر Web Crypto، والجلسات تحفظ بصمة الرمز لا الرمز نفسه. توجد حماية أولية لمحاولات تسجيل الدخول. يلزم قبل الاستخدام الفعلي إضافة تحقق البريد، ومراجعة أمنية مستقلة، ومراقبة وإعداد حدود الاستخدام، واختبارات صلاحيات شاملة. لا تعتبر هذه الإضافات وحدها اعتماداً أمنياً نهائياً.
