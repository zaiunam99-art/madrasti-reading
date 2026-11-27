export async function onRequestGet({ env }) {
  const hasDb = Boolean(env.DB);
  let database = "not_configured";
  if (hasDb) {
    try {
      await env.DB.prepare("SELECT 1 AS ok").first();
      database = "connected";
    } catch {
      database = "unavailable";
    }
  }
  return Response.json({
    service: "madrasti-api",
    status: "ok",
    database,
    timestamp: new Date().toISOString()
  }, {
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
