// ═══════════════════════════════════════════════════════════════════
// AKILI ERP — Client Supabase
//
//   npm install @supabase/supabase-js
//
// Les valeurs NEXT_PUBLIC_* sont visibles dans le navigateur. C'est normal
// pour la clé « anon » : elle ne donne aucun droit par elle-même, ce sont
// les politiques RLS (voir supabase/schema.sql) qui protègent les données.
//
// ⚠️ La clé « service_role », elle, contourne RLS. Elle ne doit JAMAIS
// porter le préfixe NEXT_PUBLIC_ ni apparaître côté navigateur.
// Idem pour la clé de l'API Claude.
// ═══════════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";

const URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigure = Boolean(URL && ANON);

let _client = null;

// Rien ne s'initialise pendant le rendu serveur : la session vit dans le
// navigateur. Renvoie null côté serveur, le code appelant doit le supporter.
export function sb() {
  if (typeof window === "undefined" || !supabaseConfigure) return null;
  if (_client) return _client;
  _client = createClient(URL, ANON, {
    auth: { persistSession: true, autoRefreshToken: true },
    realtime: { params: { eventsPerSecond: 5 } },
  });
  return _client;
}

// Messages d'erreur traduits. Sans ça l'utilisateur lit « Invalid login
// credentials », ce qui ne lui dit rien d'utile.
export function traduireErreur(e) {
  const m = (e?.message || "").toLowerCase();
  if (m.includes("invalid login"))        return "Email ou mot de passe incorrect.";
  if (m.includes("already registered"))   return "Un compte existe déjà avec cet email.";
  if (m.includes("email not confirmed"))  return "Email non confirmé — vérifiez votre boîte de réception.";
  if (m.includes("password"))             return "Mot de passe trop faible (6 caractères minimum).";
  if (m.includes("rate limit") ||
      m.includes("too many"))             return "Trop de tentatives. Réessayez dans quelques minutes.";
  if (m.includes("row-level security") ||
      m.includes("permission"))           return "Accès refusé — vérifiez les politiques RLS.";
  if (m.includes("failed to fetch") ||
      m.includes("network"))              return "Connexion internet indisponible. Vos données restent enregistrées sur l'appareil.";
  return e?.message || "Une erreur est survenue.";
}
