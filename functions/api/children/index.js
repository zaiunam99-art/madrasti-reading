import {requireParent,json} from "../../_lib/auth.js";
export async function onRequestGet({request,env}) {
  const auth=await requireParent(request,env); if(auth.error) return auth.error;
  const {results=[]}=await env.DB.prepare("SELECT id,display_name,gender_preference,grade,avatar_id,voice_id,daily_lessons_per_subject,is_active,created_at FROM children WHERE parent_id=? ORDER BY created_at").bind(auth.parent.id).all();
  return json({children:results});
}
export async function onRequestPost({request,env}) {
  const auth=await requireParent(request,env); if(auth.error) return auth.error;
  let body; try { body=await request.json(); } catch { return json({error:"بيانات غير صالحة."},400); }
  const grade=String(body.grade||"").trim().slice(0,60);
  const name=String(body.display_name||"").trim().slice(0,80);
  const gender=["neutral","boy","girl"].includes(body.gender_preference)?body.gender_preference:"neutral";
  const avatar=String(body.avatar_id||"child-neutral").slice(0,50);
  const voice=String(body.voice_id||"ar-default").slice(0,50);
  const daily=Math.max(1,Math.min(10,Number.parseInt(body.daily_lessons_per_subject||1,10)||1));
  if(!grade) return json({error:"حدد الصف الدراسي."},400);
  const id=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO children(id,parent_id,display_name,gender_preference,grade,avatar_id,voice_id,daily_lessons_per_subject) VALUES(?,?,?,?,?,?,?,?)").bind(id,auth.parent.id,name||null,gender,grade,avatar,voice,daily).run();
  return json({child:{id,display_name:name||null,gender_preference:gender,grade,avatar_id:avatar,voice_id:voice,daily_lessons_per_subject:daily}},201);
}
