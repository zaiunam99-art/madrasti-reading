import {requireParent,json} from "../../_lib/auth.js";
export async function onRequestPatch({request,env,params}) {
  const auth=await requireParent(request,env); if(auth.error) return auth.error;
  let body; try { body=await request.json(); } catch { return json({error:"بيانات غير صالحة."},400); }
  const existing=await env.DB.prepare("SELECT id FROM children WHERE id=? AND parent_id=?").bind(params.id,auth.parent.id).first();
  if(!existing) return json({error:"الملف غير موجود."},404);
  const grade=String(body.grade||"").trim().slice(0,60);
  if(!grade) return json({error:"حدد الصف الدراسي."},400);
  const name=String(body.display_name||"").trim().slice(0,80);
  const gender=["neutral","boy","girl"].includes(body.gender_preference)?body.gender_preference:"neutral";
  const avatar=String(body.avatar_id||"child-neutral").slice(0,50);
  const voice=String(body.voice_id||"ar-default").slice(0,50);
  const daily=Math.max(1,Math.min(10,Number.parseInt(body.daily_lessons_per_subject||1,10)||1));
  await env.DB.prepare("UPDATE children SET display_name=?,gender_preference=?,grade=?,avatar_id=?,voice_id=?,daily_lessons_per_subject=? WHERE id=? AND parent_id=?").bind(name||null,gender,grade,avatar,voice,daily,params.id,auth.parent.id).run();
  return json({ok:true});
}
export async function onRequestDelete({request,env,params}) {
  const auth=await requireParent(request,env); if(auth.error) return auth.error;
  const result=await env.DB.prepare("DELETE FROM children WHERE id=? AND parent_id=?").bind(params.id,auth.parent.id).run();
  if(!result.meta.changes) return json({error:"الملف غير موجود."},404);
  return json({ok:true});
}
