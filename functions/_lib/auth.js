const ITERATIONS = 310000;
const COOKIE = "madrasti_session";

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function toB64Url(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function digest(value) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}
async function derive(password, salt, iterations = ITERATIONS) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2", hash:"SHA-256", salt, iterations}, key, 256));
}
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const result = await derive(password, salt);
  return `pbkdf2$${ITERATIONS}$${toB64Url(salt)}$${toB64Url(result)}`;
}
function fromB64Url(s) {
  const normalized = s.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
export async function verifyPassword(password, stored) {
  try {
    const [kind, rounds, saltText, expectedText] = stored.split("$");
    if (kind !== "pbkdf2") return false;
    const actual = await derive(password, fromB64Url(saltText), Number(rounds));
    const expected = fromB64Url(expectedText);
    if (actual.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
    return diff === 0;
  } catch { return false; }
}
export function json(data, status = 200, extra = {}) {
  return Response.json(data, {status, headers: {"Cache-Control":"no-store", ...extra}});
}
export function cookieValue(request) {
  const cookies = request.headers.get("Cookie") || "";
  const part = cookies.split(";").map(x => x.trim()).find(x => x.startsWith(COOKIE + "="));
  return part ? decodeURIComponent(part.slice(COOKIE.length + 1)) : null;
}
export function sessionCookie(token, maxAge = 60 * 60 * 24 * 14) {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
export function clearSessionCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}
export async function createSession(db, parentId) {
  const token = toB64Url(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await digest(token);
  const expires = new Date(Date.now() + 14 * 86400000).toISOString();
  await db.prepare("INSERT INTO sessions(token_hash,parent_id,expires_at) VALUES(?,?,?)").bind(tokenHash,parentId,expires).run();
  return token;
}
export async function getParent(request, env) {
  if (!env.DB) return null;
  const token = cookieValue(request);
  if (!token) return null;
  const tokenHash = await digest(token);
  const row = await env.DB.prepare("SELECT p.id,p.email,p.display_name,s.expires_at FROM sessions s JOIN parents p ON p.id=s.parent_id WHERE s.token_hash=?").bind(tokenHash).first();
  if (!row || Date.parse(row.expires_at) <= Date.now()) {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(tokenHash).run();
    return null;
  }
  return {id:row.id,email:row.email,display_name:row.display_name};
}
export async function requireParent(request, env) {
  if (!env.DB) return {error: json({error:"قاعدة البيانات غير مربوطة بعد."},503)};
  const parent = await getParent(request, env);
  return parent ? {parent} : {error:json({error:"يلزم تسجيل الدخول."},401)};
}
