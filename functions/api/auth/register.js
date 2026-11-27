import {hashPassword,createSession,sessionCookie,json} from "../../_lib/auth.js";
export async function onRequestPost({request,env}) {
  if (!env.DB) return json({error:"قاعدة البيانات غير مربوطة بعد."},503);
  const origin=request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return json({error:"طلب غير مسموح."},403);
  let body; try { body=await request.json(); } catch { return json({error:"بيانات غير صالحة."},400); }
  const email=String(body.email||"").trim().toLowerCase();
  const password=String(body.password||"");
  const displayName=String(body.display_name||"").trim().slice(0,80);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254) return json({error:"أدخل بريداً إلكترونياً صحيحاً."},400);
  if (password.length<12 || password.length>200) return json({error:"يجب أن تتكون كلمة المرور من 12 حرفاً على الأقل."},400);
  const id=crypto.randomUUID();
  const passwordHash=await hashPassword(password);
  try {
    await env.DB.prepare("INSERT INTO parents(id,email,password_hash,display_name) VALUES(?,?,?,?)").bind(id,email,passwordHash,displayName||null).run();
  } catch {
    return json({error:"تعذر إنشاء الحساب. قد يكون البريد مستخدماً بالفعل."},409);
  }
  const token=await createSession(env.DB,id);
  return json({ok:true,parent:{id,email,display_name:displayName||null}},201,{"Set-Cookie":sessionCookie(token)});
}
