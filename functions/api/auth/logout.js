import {cookieValue,clearSessionCookie,json} from "../../_lib/auth.js";
export async function onRequestPost({request,env}) {
  const token=cookieValue(request);
  if (token && env.DB) {
    const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));
    const hash=[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("");
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(hash).run();
  }
  return json({ok:true},200,{"Set-Cookie":clearSessionCookie()});
}
