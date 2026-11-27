import {verifyPassword,createSession,sessionCookie,json} from "../../_lib/auth.js";
export async function onRequestPost({request,env}) {
  if (!env.DB) return json({error:"قاعدة البيانات غير مربوطة بعد."},503);
  const origin=request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return json({error:"طلب غير مسموح."},403);
  let body; try { body=await request.json(); } catch { return json({error:"بيانات غير صالحة."},400); }
  const email=String(body.email||"").trim().toLowerCase();
  const password=String(body.password||"");
  const row=await env.DB.prepare("SELECT id,email,password_hash,display_name FROM parents WHERE email=?").bind(email).first();
  if (!row || !(await verifyPassword(password,row.password_hash))) return json({error:"البريد الإلكتروني أو كلمة المرور غير صحيحة."},401);
  const token=await createSession(env.DB,row.id);
  return json({ok:true,parent:{id:row.id,email:row.email,display_name:row.display_name}},200,{"Set-Cookie":sessionCookie(token)});
}
