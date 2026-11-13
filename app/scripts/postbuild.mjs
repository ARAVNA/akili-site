// Après « vite build » : sépare la vitrine (/) de l'application (/app).
//
// Pourquoi : sur Vercel, un fichier qui existe réellement est servi AVANT
// les « rewrites ». Tant que dist/index.html (l'application) existait, la
// règle « / → /accueil.html » de vercel.json ne s'appliquait jamais : la
// racine du site affichait l'écran de connexion, vide pour Google (0 mot).
// On renomme donc l'application en app.html ; « / » retombe alors sur le
// rewrite et sert la vitrine, qui est du HTML complet.
import { existsSync, renameSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const exige = (f) => { if (!existsSync(f)) { console.error("✗ manquant dans dist :", f); process.exit(1); } };
exige("dist/index.html");
renameSync("dist/index.html", "dist/app.html");
for (const f of ["dist/accueil.html","dist/robots.txt","dist/sitemap.xml","dist/app.html"]) exige(f);

// La CSP (vercel.json) autorise les scripts en ligne de la vitrine par leur
// empreinte. Si l'un d'eux est modifié, on le dit ici plutôt que de laisser
// le navigateur le bloquer en silence.
const csp = readFileSync("vercel.json","utf8");
for (const f of ["dist/accueil.html","dist/guide.html"]) {
  const t = readFileSync(f,"utf8");
  for (const m of t.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    const h = "sha256-" + createHash("sha256").update(m[1]).digest("base64");
    if (!csp.includes(h)) { console.error("✗ script en ligne modifié dans", f, "— mettre à jour l'empreinte dans vercel.json :", h); process.exit(1); }
  }
}
console.log("✓ postbuild : app.html, accueil.html, robots.txt, sitemap.xml en place");
