// Garde-fous de construction : le build ÉCHOUE plutôt que de publier un secret ou une application en mode démo.
//   node scripts/garde-fous.mjs avant   → avant « vite build » : variables d'environnement
//   node scripts/garde-fous.mjs apres   → après : contenu de dist/
// Jamais de valeur de secret dans les messages : seulement des noms.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const phase = process.argv[2];
const env = process.env;
const DIST = env.GARDE_DIST || "dist";
const erreurs = [];

// Un nom de variable exposée au navigateur (VITE_*, NEXT_PUBLIC_*) ne doit rien suggérer de secret.
const SENSIBLE = /(SERVICE_ROLE|SECRET|PRIVATE|PASSWORD|PASSWD|TOKEN|ANTHROPIC|PAIEMENT|WEBHOOK)/i;
if (phase === "avant") {
  for (const nom of Object.keys(env)) {
    if (/^(VITE_|NEXT_PUBLIC_)/.test(nom) && SENSIBLE.test(nom) && !/ANON_KEY$/.test(nom))
      erreurs.push(`Variable exposée au navigateur au nom suspect : ${nom} (les préfixes VITE_/NEXT_PUBLIC_ l'embarquent dans le code public)`);
  }
  // Production sans Supabase = application en « mode démo » (aucun mot de passe, données dans le navigateur).
  if (env.VERCEL_ENV === "production") {
    const url = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
    const cle = env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !cle) erreurs.push("Production sans VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY : l'application démarrerait en mode démo local");
  }
}

if (phase === "apres") {
  const fichiers = [];
  const parcourir = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? parcourir(p) : fichiers.push(p); } };
  if (!existsSync(DIST)) erreurs.push(`${DIST} introuvable`); else parcourir(DIST);
  const secrets = Object.entries(env).filter(([n, v]) => /^(SUPABASE_SERVICE_ROLE_KEY|ANTHROPIC_API_KEY|PAIEMENT_SECRET_.*)$/.test(n) && v && v.length >= 8);
  for (const f of fichiers) {
    if (!/\.(js|mjs|html|css|json|map|txt)$/.test(f)) continue;
    const t = readFileSync(f, "utf8");
    for (const [n, v] of secrets) if (t.includes(v)) erreurs.push(`La valeur de ${n} figure dans ${f}`);
    if (/sk-ant-[A-Za-z0-9_-]{20,}/.test(t)) erreurs.push(`Clé de type Anthropic dans ${f}`);
    for (const m of t.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{5,}/g)) {
      try { const pl = JSON.parse(Buffer.from(m[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
        if (pl.role && pl.role !== "anon") erreurs.push(`Jeton Supabase de rôle « ${pl.role} » dans ${f}`); } catch {}
    }
    if (/\.map$/.test(f)) erreurs.push(`Source map publiée : ${f}`);
  }
}

if (erreurs.length) { console.error("✗ garde-fous (" + phase + ") :\n  - " + erreurs.join("\n  - ")); process.exit(1); }
console.log(`✓ garde-fous (${phase}) : rien de suspect`);
