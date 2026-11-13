import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("..", import.meta.url));
const srv = await createServer({ root, server:{middlewareMode:true}, appType:"custom", logLevel:"error" });
const res = []; const t = (n, f) => Promise.resolve().then(f).then(()=>res.push(["✅",n]), e=>res.push(["❌",n+" — "+e.message]));

// ── 1. XSS du chat ──
const mod = await srv.ssrLoadModule("/src/App.jsx");
await t("echapperHtml neutralise <script>/<img onerror>", () => {
  const e = mod.echapperHtml;
  assert.equal(e('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.ok(!e('<script>alert(1)</script>').includes('<'));
  assert.equal(e('"\'&'), '&quot;&#39;&amp;');
  assert.equal(e(null), '');
});

// ── 2. /api/ia avec fetch simulé ──
const ENV = { VITE_SUPABASE_URL:"https://x.supabase.co", ANTHROPIC_API_KEY:"test-key-factice", SUPABASE_SERVICE_ROLE_KEY:"svc-factice" };
async function appeler({ env = ENV, body = {messages:[{role:"user",content:"Bonjour"}]}, auth = "Bearer jeton", method="POST", sb = {} }) {
  Object.keys(process.env).filter(k=>/SUPABASE|ANTHROPIC/.test(k)).forEach(k=>delete process.env[k]);
  Object.assign(process.env, env);
  const appels = [];
  globalThis.fetch = async (url, opt={}) => {
    appels.push({ url:String(url), opt });
    const u = String(url);
    const rep = (o, ok=true, status=200) => ({ ok, status, json: async()=>o });
    if (u.includes("/auth/v1/user")) return sb.user ?? rep({ id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
    if (u.includes("profiles?")) return rep([{ org_id:"11111111-1111-4111-8111-111111111111" }]);
    if (u.includes("organizations?")) return rep([{ plan:"starter" }]);
    if (u.includes("ai_quotas?org_id")) return rep([{ count: sb.compte ?? 0 }]);
    if (u.includes("/rpc/incrementer_quota_ia")) return sb.rpc ?? rep(1);
    if (u.includes("api.anthropic.com")) return rep({ content:[{ text:"Réponse test" }] });
    if (u.includes("ai_quotas?on_conflict")) return rep({});
    return rep({}, false, 404);
  };
  const h = (await import(root + "api/ia.js?v="+Math.random())).default;
  let code, out; const hdrs = {};
  const res = { setHeader:(k,v)=>hdrs[k]=v, status:c=>({ json:o=>{code=c; out=o;} }) };
  await h({ method, headers:{ authorization:auth }, body }, res);
  return { code, out, appels, hdrs };
}
await t("API : GET refusé (405)", async()=>{ assert.equal((await appeler({method:"GET"})).code,405); });
await t("API : sans jeton → 401", async()=>{ assert.equal((await appeler({auth:""})).code,401); });
await t("API : sans clé service_role → échec fermé (500), aucun appel Anthropic", async()=>{
  const r = await appeler({ env:{...ENV, SUPABASE_SERVICE_ROLE_KEY:""} });
  assert.equal(r.code,500); assert.ok(!r.appels.some(a=>a.url.includes("anthropic")));
});
await t("API : jeton invalide → 401, aucun appel Anthropic", async()=>{
  const r = await appeler({ sb:{ user:{ ok:false, status:401, json:async()=>({}) } } });
  assert.equal(r.code,401); assert.ok(!r.appels.some(a=>a.url.includes("anthropic")));
});
await t("API : variable NEXT_PUBLIC_SUPABASE_URL seule acceptée", async()=>{
  const r = await appeler({ env:{ NEXT_PUBLIC_SUPABASE_URL:"https://y.supabase.co", ANTHROPIC_API_KEY:"k", SUPABASE_SERVICE_ROLE_KEY:"s" } });
  assert.equal(r.code,200);
});
await t("API : requête valide → 200 + texte, clé Anthropic hors de la réponse", async()=>{
  const r = await appeler({}); assert.equal(r.code,200); assert.equal(r.out.texte,"Réponse test");
  assert.ok(!JSON.stringify(r.out).includes("test-key-factice")); assert.equal(r.hdrs["Cache-Control"],"no-store");
});
await t("API : quota décompté par RPC atomique", async()=>{
  const r = await appeler({}); assert.ok(r.appels.some(a=>a.url.includes("/rpc/incrementer_quota_ia")));
  assert.ok(!r.appels.some(a=>a.url.includes("ai_quotas?on_conflict")), "pas de repli si la RPC réussit");
});
await t("API : repli si la RPC n'existe pas encore", async()=>{
  const r = await appeler({ sb:{ rpc:{ ok:false, status:404, json:async()=>({}) } } });
  assert.equal(r.code,200); assert.ok(r.appels.some(a=>a.url.includes("ai_quotas?on_conflict")));
});
await t("API : plafond de sécurité en phase de test (500)", async()=>{
  const r = await appeler({ sb:{ compte:500 } }); assert.equal(r.code,429); assert.ok(!r.appels.some(a=>a.url.includes("anthropic")));
});
await t("API : rôles invalides filtrés (system/tool ignorés)", async()=>{
  const r = await appeler({ body:{ messages:[{role:"system",content:"x"},{role:"user",content:"ok"}] } });
  const a = r.appels.find(a=>a.url.includes("anthropic")); const m = JSON.parse(a.opt.body).messages;
  assert.deepEqual(m.map(x=>x.role),["user"]);
});
await t("API : corps vide → 400", async()=>{ assert.equal((await appeler({body:{}})).code,400); });
await srv.close();
console.log(res.map(r=>r.join(" ")).join("\n")); const ko=res.filter(r=>r[0]==="❌").length; console.log(`\n${res.length-ko}/${res.length} tests conformes`); process.exit(ko?1:0);
