import {verifyPassword,createSession,sessionCookie,json} from "../../_lib/auth.js";
async function keyFor(request,email) {
  const ip=request.headers.get("CF-Connecting-IP")||"unknown";
  const raw=email+"|"+ip;
  const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw));
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
export async function onRequestPost({request,env}) {
  if (!env.DB) return json({error:"قاعدة البيانات غير مربوطة بعد."},503);
  const origin=request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return json({error:"طلب غير مسموح."},403);
  let body; try { body=await request.json(); } catch { return json({error:"بيانات غير صالحة."},400); }
  const email=String(body.email||"").trim().toLowerCase();
  const password=String(body.password||"");
  const bucket=await keyFor(request,email);
  const now=Math.floor(Date.now()/1000);
  const limit=await env.DB.prepare("SELECT window_started,attempts FROM auth_rate_limits WHERE bucket_key=?").bind(bucket).first();
  if(limit && now-limit.window_started<900 && limit.attempts>=8) return json({error:"محاولات كثيرة. انتظر 15 دقيقة ثم حاول مجدداً."},429);
  if(!limit || now-limit.window_started>=900) {
    await env.DB.prepare("INSERT INTO auth_rate_limits(bucket_key,window_started,attempts) VALUES(?,?,1) ON CONFLICT(bucket_key) DO UPDATE SET window_started=excluded.window_started,attempts=1").bind(bucket,now).run();
  } else {
    await env.DB.prepare("UPDATE auth_rate_limits SET attempts=attempts+1 WHERE bucket_key=?").bind(bucket).run();
  }
  const row=await env.DB.prepare("SELECT id,email,password_hash,display_name FROM parents WHERE email=?").bind(email).first();
  if (!row || !(await verifyPassword(password,row.password_hash))) return json({error:"البريد الإلكتروني أو كلمة المرور غير صحيحة."},401);
  await env.DB.prepare("DELETE FROM auth_rate_limits WHERE bucket_key=?").bind(bucket).run();
  const token=await createSession(env.DB,row.id);
  return json({ok:true,parent:{id:row.id,email:row.email,display_name:row.display_name}},200,{"Set-Cookie":sessionCookie(token)});
}
