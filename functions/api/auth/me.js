import {getParent,json} from "../../_lib/auth.js";
export async function onRequestGet({request,env}) {
  if (!env.DB) return json({error:"قاعدة البيانات غير مربوطة بعد."},503);
  const parent=await getParent(request,env);
  return parent ? json({authenticated:true,parent}) : json({authenticated:false},401);
}
