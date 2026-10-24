import { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
         PieChart, Pie, Cell, LineChart, Line, CartesianGrid, AreaChart, Area } from "recharts";
import { createClient } from "@supabase/supabase-js";

// ═══════════════════════════════════════════════════════════════════
// AKILI ERP v8 — ÉDITION COMPLÈTE
// ✅ Option A : KPIs avancés (taux conversion, point mort, prévision trésorerie)
// ✅ Option C : Gestion stocks + Module RH/Paie
// + Tous les correctifs précédents
// ═══════════════════════════════════════════════════════════════════

// ─── THÈME ────────────────────────────────────────────────────────
const T = {
  bg:"#05080F", card:"#0C1219", card2:"#101820", border:"#202C3C",
  // Une seule couleur d'accent : l'or sombre
  accent:"#D9A441", accentD:"#8A6520", accentG:"#D9A4411A",
  // Deux couleurs de sens uniquement (positif / negatif), volontairement sourdes
  green:"#6E9E7C", red:"#C4635E",
  // Les anciennes couleurs vives sont neutralisees
  blue:"#8DA2B8", purple:"#8DA2B8", orange:"#D9A441",
  cyan:"#8DA2B8", indigo:"#8DA2B8",
  text:"#EDF3F9", muted:"#8095AB", light:"#141F2C",
};

// ─── EDITEUR ──────────────────────────────────────────────────────
// Reference unique : toute mention legale de l'application lit ici.
// Source : mentions legales publiees sur www.africavit.com
const EDITEUR = {
  nom:      "AFRICAViT SARL",
  capital:  "10 000 000 FCFA",
  rccm:     "CI-ABJ-03-2026-B12-06782",
  ncc:      "2606664 R",
  idu:      "CI-2026-0076905 F",
  siege:    "Cocody-Angré, Lot 4527, Abidjan, Côte d'Ivoire",
  tel:      "+225 27 22 35 33 27",
  whatsapp: "+225 05 74 19 97 60",
  email:    "contact@africavit.com",
  site:     "www.africavit.com",
  produits: "AKILI ERP et IVOORIA sont des marques et produits d'AFRICAViT SARL.",
  droit:    "Droit ivoirien — tribunaux d'Abidjan exclusivement compétents.",
};

// ─── PLANS ────────────────────────────────────────────────────────
const PLANS = {
  starter:    { label:"Starter",    color:T.blue,   prix:0,     quota:30,  docs:10  },
  business:   { label:"Business",   color:T.accent, prix:15000, quota:150, docs:999 },
  enterprise: { label:"Entreprise", color:T.purple, prix:50000, quota:999, docs:999 },
};

// ─── PHASE DE TEST ────────────────────────────────────────────────
// akili.africavit.com annonce : « toutes les options d'Akili ERP sont
// gratuites jusqu'au 21 novembre 2026 ». L'application doit tenir cette
// promesse : pendant la phase, aucune limite de quota ne s'applique.
const PHASE_TEST_FIN = new Date("2026-11-21T23:59:59");
const enPhaseTest = () => new Date() <= PHASE_TEST_FIN;
const joursRestants = () => Math.max(0, Math.ceil((PHASE_TEST_FIN - new Date()) / 86400000));

// ═══════════════════════════════════════════════════════════════════
// COUCHE DE DONNÉES — vraies tables Supabase
//
// L'application lit et écrit dans les tables réelles du projet
// akili.erp : clients, documents, ecritures, employes, achats,
// fournisseurs, stocks, mouvements_stock, fiches_paie, projets,
// signatures, ai_quotas, taux_change.
//
// L'interface reste SYNCHRONE — Store.get(cle) / Store.set(cle, liste) —
// pour que les écrans n'aient pas à changer. Sous le capot :
//
//   get  → cache mémoire, alimenté au démarrage et par Realtime
//   set  → comparaison avec le cache, puis insert / update / delete
//          des seules lignes qui ont réellement changé
//
// Pourquoi comparer plutôt que tout réécrire : un module appelle
// Store.set avec la liste entière à chaque modification. Réécrire
// 200 clients pour en changer un serait absurde et ferait exploser
// le quota de requêtes.
// ═══════════════════════════════════════════════════════════════════

const SB_URL  = import.meta.env.VITE_SUPABASE_URL;
const SB_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
const SB_OK   = Boolean(SB_URL && SB_ANON);

let _sb = null;
const sb = () => {
  if (!SB_OK) return null;
  if (!_sb) _sb = createClient(SB_URL, SB_ANON, {
    auth:{ persistSession:true, autoRefreshToken:true },
    realtime:{ params:{ eventsPerSecond:5 } },
  });
  return _sb;
};
const actif = () => SB_OK && !!sb();

const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
      const r = Math.random()*16|0; return (c==="x"?r:(r&0x3|0x8)).toString(16); }));

// ─── Correspondance entre les champs de l'écran et les colonnes ───
// À gauche le nom utilisé par les écrans, à droite la colonne réelle.
// Toute colonne absente ici n'est ni lue ni écrite.
const SCHEMA = {
  clients: { table:"clients", id:"uuid", champs:{
    nom:"nom", secteur:"secteur", statut:"statut", ca:"ca",
    tel:"tel", email:"email", note:"note" }},

  docs: { table:"documents", id:"texte", champs:{
    type:"type", client:"client", montant:"montant", devise:"devise",
    content:"content", owner:"user_id", statutPaiement:"statut_paiement",
    dateEcheance:"date_echeance", montantHT:"montant_ht", tva:"tva",
    montantTVA:"montant_tva", nifClient:"nif_client", rccmClient:"rccm_client",
    adresseClient:"adresse_client", lignes:"lignes" }},

  ecrit: { table:"ecritures", id:"uuid", champs:{
    date:"date", libelle:"libelle", compte:"compte", debit:"debit",
    credit:"credit", piece:"piece", src:"src", journal:"journal" }},

  employes: { table:"employes", id:"uuid", champs:{
    nom:"nom", poste:"poste", typeContrat:"type_contrat",
    salaireBrut:"salaire_brut", departement:"departement",
    dateEntree:"date_entree", tel:"tel", email:"email",
    congesRestants:"conges_restants" }},

  achats: { table:"achats", id:"texte", champs:{
    date:"date", fournisseur:"fournisseur", fournisseurId:"fournisseur_id",
    designation:"description", montantHT:"montant", tva:"tva",
    statut:"statut", piece:"piece" }},

  fourn: { table:"fournisseurs", id:"uuid", champs:{
    nom:"nom", contact:"contact", tel:"tel", email:"email",
    compte:"compte", notes:"notes" }},

  stocks: { table:"stocks", id:"uuid", champs:{
    nom:"nom", categorie:"categorie", quantite:"quantite", unite:"unite",
    prixAchat:"prix_achat", prixVente:"prix_vente",
    seuilAlerte:"seuil_alerte", fournisseur:"fournisseur" }},

  mvts: { table:"mouvements_stock", id:"uuid", champs:{
    produitId:"produit_id", produitNom:"produit_nom", type:"type",
    quantite:"quantite", motif:"motif", date:"date",
    ancienStock:"ancien_stock", nouveauStock:"nouveau_stock" }},

  paie: { table:"fiches_paie", id:"uuid", champs:{
    employeId:"employe_id", employeNom:"employe_nom", poste:"poste",
    mois:"mois", brut:"brut", cnpsSalarie:"cnps_salarie",
    cnpsPatronal:"cnps_patronal", its:"its", net:"net",
    coutTotal:"cout_total", date:"date" }},

  projets: { table:"projets", id:"uuid", champs:{
    nom:"nom", client:"client", budget:"budget", echeance:"echeance",
    avancement:"avancement", colonne:"colonne", notes:"notes" }},

  sign: { table:"signatures", id:"uuid", champs:{
    docId:"document_id", docType:"doc_type", docClient:"doc_client",
    nom:"signataire", qualite:"qualite", horodatage:"horodatage",
    empreinte:"empreinte", image:"image" }},
};

// Colonnes numériques : Postgres renvoie du texte pour numeric, et les
// écrans comparent parfois avec ===. On convertit au passage.
const NOMBRES = new Set(["ca","montant","debit","credit","salaire_brut",
  "conges_restants","quantite","prix_achat","prix_vente","seuil_alerte",
  "ancien_stock","nouveau_stock","brut","cnps_salarie","cnps_patronal",
  "its","net","cout_total","budget","avancement","montant_ht","tva",
  "montant_tva","count"]);

const versEcran = (nom, ligne) => {
  const s = SCHEMA[nom]; const o = { id: ligne.id };
  for (const [k, col] of Object.entries(s.champs)) {
    let v = ligne[col];
    if (v !== null && v !== undefined && NOMBRES.has(col)) v = Number(v);
    o[k] = v ?? "";
  }
  if (ligne.created_at) o.creeLe = ligne.created_at;
  return o;
};

const versBase = (nom, obj, orgId) => {
  const s = SCHEMA[nom]; const o = { id: obj.id, org_id: orgId };
  for (const [k, col] of Object.entries(s.champs)) {
    let v = obj[k];
    if (v === "" || v === undefined) v = null;
    if (v !== null && NOMBRES.has(col)) { const n = Number(v); v = isNaN(n) ? null : n; }
    o[col] = v;
  }
  return o;
};

// ─── Store ────────────────────────────────────────────────────────
export const Store = {
  _c:new Map(), _subs:new Set(), _rsubs:new Set(), _chan:null,
  _scope:null, _pending:0, _hooked:false, _file:new Map(),

  // akili_clients_<orgId> → "clients"
  _nom(k){
    const s=Store._scope; if(!s) return null;
    if(k===`akili_chat_${s.uid}`) return "chat";
    if(k.startsWith(`akili_q_${s.uid}_`)) return "quota";
    if(k.startsWith(`akili_taux_`)) return "taux";
    if(s.orgId && k.endsWith(`_${s.orgId}`)){
      const n=k.slice(6,-(s.orgId.length+1));
      return SCHEMA[n] ? n : null;
    }
    return null;
  },
  _cle(nom){
    const s=Store._scope; if(!s) return null;
    return `akili_${nom}_${s.orgId}`;
  },

  // Le chat et les réglages restent dans le navigateur : ils ne
  // concernent qu'une personne sur un appareil, et les mettre en base
  // coûterait une requête par message sans rien apporter.
  _localGet(k,d){ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch{ return d; } },
  _localSet(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); return true; }catch{ return false; } },

  get(k,d=[]){
    if(Store._c.has(k)) return Store._c.get(k);
    const v=Store._localGet(k,d);
    Store._c.set(k,v);
    return v;
  },

  set(k,v){
    Store._c.set(k,v);
    Store._localSet(k,v);
    const nom=Store._nom(k);
    if(actif()&&nom&&SCHEMA[nom]) Store._sync(nom,v);
    else if(actif()&&nom==="quota") Store._syncQuota(v);
    else if(actif()&&nom==="taux")  Store._syncTaux(v);
    Store._emit();
    return true;
  },

  // Compare l'ancien et le nouvel état, n'envoie que les différences.
  async _sync(nom,liste){
    const s=SCHEMA[nom], org=Store._scope?.orgId;
    if(!org) return;
    const avant=Store._file.get(nom)||[];
    const idsAvant=new Set(avant.map(x=>x.id));
    const idsApres=new Set();

    const aInserer=[], aMajour=[];
    for(const item of (liste||[])){
      // Les tables à identifiant uuid refusent nos numéros lisibles.
      if(!item.id || (s.id==="uuid" && !/^[0-9a-f-]{36}$/i.test(item.id))) item.id=uuid();
      idsApres.add(item.id);
      const ancien=avant.find(x=>x.id===item.id);
      const ligne=versBase(nom,item,org);
      if(!ancien) aInserer.push(ligne);
      else if(JSON.stringify(versBase(nom,ancien,org))!==JSON.stringify(ligne)) aMajour.push(ligne);
    }
    const aSupprimer=[...idsAvant].filter(id=>!idsApres.has(id));

    Store._file.set(nom,JSON.parse(JSON.stringify(liste||[])));
    if(!aInserer.length&&!aMajour.length&&!aSupprimer.length) return;

    Store._pending++; Store._emit();
    try{
      const c=sb();
      if(aInserer.length){ const {error}=await c.from(s.table).insert(aInserer); if(error) throw error; }
      if(aMajour.length){ const {error}=await c.from(s.table).upsert(aMajour,{onConflict:"id"}); if(error) throw error; }
      if(aSupprimer.length){ const {error}=await c.from(s.table).delete().in("id",aSupprimer); if(error) throw error; }
    }catch(e){
      console.warn("Supabase",s.table,e?.message);
      // L'état local reste juste ; la prochaine écriture retentera.
      Store._file.set(nom,avant);
    }finally{ Store._pending--; Store._emit(); }
  },

  async _syncQuota(v){
    const s=Store._scope; if(!s?.orgId) return;
    const mois=`${new Date().getMonth()}_${new Date().getFullYear()}`;
    try{ await sb().from("ai_quotas")
      .upsert({org_id:s.orgId,month:mois,count:Number(v?.count||0)},{onConflict:"org_id,month"}); }
    catch(e){ console.warn("ai_quotas",e?.message); }
  },
  async _syncTaux(v){
    const s=Store._scope; if(!s?.orgId) return;
    try{ await sb().from("taux_change")
      .upsert({org_id:s.orgId,usd:Number(v?.usd||0),maj:new Date().toISOString()},{onConflict:"org_id"}); }
    catch(e){ console.warn("taux_change",e?.message); }
  },

  // ─── Chargement initial + temps réel ───
  async bind(scope){
    await Store.unbind();
    Store._scope=scope;
    if(!actif()||!scope?.orgId) return;
    const c=sb(), org=scope.orgId;

    await Promise.all(Object.entries(SCHEMA).map(async([nom,s])=>{
      try{
        const {data,error}=await c.from(s.table).select("*").eq("org_id",org)
          .order("created_at",{ascending:false}).limit(2000);
        if(error) throw error;
        const liste=(data||[]).map(l=>versEcran(nom,l));
        Store._c.set(Store._cle(nom),liste);
        Store._file.set(nom,JSON.parse(JSON.stringify(liste)));
        Store._localSet(Store._cle(nom),liste);
      }catch(e){ console.warn("chargement",s.table,e?.message); }
    }));

    // Quota de l'organisation (et non de la personne)
    try{
      const mois=`${new Date().getMonth()}_${new Date().getFullYear()}`;
      const {data}=await c.from("ai_quotas").select("count")
        .eq("org_id",org).eq("month",mois).maybeSingle();
      Store._c.set(`akili_q_${scope.uid}_${mois}`,{count:Number(data?.count||0)});
    }catch{}
    try{
      const {data}=await c.from("taux_change").select("usd").eq("org_id",org).maybeSingle();
      if(data) Store._c.set(`akili_taux_${org}`,{usd:Number(data.usd||0)});
    }catch{}

    Store._emit(); Store._emitRemote();

    // Temps réel : un seul canal pour toutes les tables de l'entreprise
    Store._chan=c.channel("akili_tables");
    Object.entries(SCHEMA).forEach(([nom,s])=>{
      Store._chan.on("postgres_changes",
        {event:"*",schema:"public",table:s.table,filter:`org_id=eq.${org}`},
        async ()=>{
          try{
            const {data}=await c.from(s.table).select("*").eq("org_id",org)
              .order("created_at",{ascending:false}).limit(2000);
            const liste=(data||[]).map(l=>versEcran(nom,l));
            const cle=Store._cle(nom);
            if(JSON.stringify(Store._c.get(cle))===JSON.stringify(liste)) return;
            Store._c.set(cle,liste);
            Store._file.set(nom,JSON.parse(JSON.stringify(liste)));
            Store._localSet(cle,liste);
            Store._emit(); Store._emitRemote();
          }catch{}
        });
    });
    Store._chan.subscribe();
  },

  async unbind(){
    if(Store._chan){ try{ await sb()?.removeChannel(Store._chan); }catch{} Store._chan=null; }
    Store._scope=null;
  },
  async clear(){ await Store.unbind(); Store._c.clear(); Store._file.clear(); },

  subscribe(cb){ Store._subs.add(cb); return ()=>Store._subs.delete(cb); },
  subscribeRemote(cb){ Store._rsubs.add(cb); return ()=>Store._rsubs.delete(cb); },
  _emit(){ Store._subs.forEach(f=>{try{f();}catch{}}); },
  _emitRemote(){ Store._rsubs.forEach(f=>{try{f();}catch{}}); },
  syncing(){ return Store._pending>0; },
  size(){ try{ let t=0; for(let k in localStorage) if(localStorage.hasOwnProperty(k)) t+=localStorage[k].length; return Math.round(t/1024); }catch{ return 0; } },
};

function useSync(){
  const [,bump]=useState(0);
  const [rv,rbump]=useState(0);
  useEffect(()=>{
    const a=Store.subscribe(()=>bump(n=>n+1));
    const b=Store.subscribeRemote(()=>rbump(n=>n+1));
    return()=>{a();b();};
  },[]);
  return rv;
}


// ─── QUOTA ────────────────────────────────────────────────────────
const QM = {
  key:(uid)=>`akili_q_${uid}_${new Date().getMonth()}_${new Date().getFullYear()}`,
  usage:(uid)=>Store.get(QM.key(uid),{count:0}),
  inc:(uid)=>{ const u=QM.usage(uid); Store.set(QM.key(uid),{count:u.count+1}); return u.count+1; },
  // Phase de test : promesse publique de gratuite totale, donc aucune limite
  can:(uid,plan)=>enPhaseTest()||QM.usage(uid).count<(PLANS[plan]?.quota||30),
  left:(uid,plan)=>enPhaseTest()?999:Math.max(0,(PLANS[plan]?.quota||30)-QM.usage(uid).count),
};

// ─── AUTH ─────────────────────────────────────────────────────────
const AuthCtx = createContext(null);
const useAuth = ()=>useContext(AuthCtx);

const traduire = (e)=>{
  const m=(e?.message||"").toLowerCase();
  if(m.includes("invalid login"))       return "Email ou mot de passe incorrect.";
  if(m.includes("already registered"))  return "Un compte existe déjà avec cet email.";
  if(m.includes("email not confirmed")) return "Email non confirmé — vérifiez votre boîte de réception.";
  if(m.includes("password"))            return "Mot de passe trop faible (6 caractères minimum).";
  if(m.includes("rate limit")||m.includes("too many")) return "Trop de tentatives. Réessayez dans quelques minutes.";
  if(m.includes("row-level security")||m.includes("permission")) return "Accès refusé — vérifiez les politiques RLS.";
  if(m.includes("failed to fetch")||m.includes("network")) return "Connexion internet indisponible.";
  return e?.message||"Une erreur est survenue.";
};

function AuthProvider({children}){
  const [user,setUser]=useState(null);
  const [boot,setBoot]=useState(true);
  const mode = SB_OK ? "supabase" : "demo";

  // Charge le profil depuis la table `profiles`, et la crée au besoin.
  const chargerProfil = async (u)=>{
    const base={ uid:u.id, email:u.email,
                 name:u.user_metadata?.name||u.email.split("@")[0],
                 entreprise:u.user_metadata?.entreprise||"",
                 orgId:u.id, role:"admin", plan:"starter" };
    try{
      const {data}=await sb().from("profiles").select("*").eq("id",u.id).maybeSingle();
      if(data){
        base.name       = data.name||data.full_name||base.name;
        base.entreprise = data.entreprise||data.company||base.entreprise;
        base.orgId      = data.organization_id||data.org_id||u.id;
        base.plan       = data.plan||"starter";
      }else{
        await sb().from("profiles").insert({ id:u.id, email:u.email, name:base.name }).then(()=>{},()=>{});
      }
    }catch{}
    return base;
  };

  useEffect(()=>{
    let vivant=true;
    if(!SB_OK){
      let u=null; try{ u=JSON.parse(sessionStorage.getItem("akili_s")); }catch{}
      if(u) Store.bind({uid:u.uid,orgId:u.orgId||u.uid});
      setUser(u); setBoot(false);
      return;
    }
    (async()=>{
      const {data:{session}}=await sb().auth.getSession();
      if(!vivant) return;
      if(session?.user){
        const p=await chargerProfil(session.user);
        await Store.bind({uid:p.uid,orgId:p.orgId});
        if(vivant) setUser(p);
      }
      if(vivant) setBoot(false);
    })();
    const {data:{subscription}}=sb().auth.onAuthStateChange(async(_e,session)=>{
      if(!vivant) return;
      if(!session?.user){ await Store.clear(); setUser(null); setBoot(false); return; }
      const p=await chargerProfil(session.user);
      await Store.bind({uid:p.uid,orgId:p.orgId});
      setUser(p); setBoot(false);
    });
    return()=>{ vivant=false; subscription?.unsubscribe(); };
  },[]);

  const saveLocal=u=>{ if(u) sessionStorage.setItem("akili_s",JSON.stringify(u)); else sessionStorage.removeItem("akili_s"); setUser(u); };

  const register=async(email,pass,name,ent)=>{
    if(!email||!pass||!name) throw new Error("Tous les champs sont requis.");
    if(pass.length<6)        throw new Error("Mot de passe : 6 caractères minimum.");
    if(!/\S+@\S+\.\S+/.test(email)) throw new Error("Email invalide.");
    if(SB_OK){
      const {data,error}=await sb().auth.signUp({ email, password:pass, options:{ data:{ name, entreprise:ent||"" } } });
      if(error) throw new Error(traduire(error));
      if(!data.session) throw new Error("Compte créé. Confirmez votre email avant de vous connecter.");
      return true;    // onAuthStateChange prend le relais
    }
    const us=Store._localGet("akili_users",{});
    if(us[email]) throw new Error("Compte déjà existant.");
    const uid="uid_"+Date.now();
    us[email]={uid,name,email,entreprise:ent,orgId:uid,role:"admin",plan:"starter",createdAt:today()};
    Store._localSet("akili_users",us);
    const u={uid,email,name,entreprise:ent,orgId:uid,role:"admin",plan:"starter"};
    Store.bind({uid,orgId:uid}); saveLocal(u); return u;
  };

  const login=async(email,pass)=>{
    if(!email||!pass) throw new Error("Email et mot de passe requis.");
    if(SB_OK){
      const {error}=await sb().auth.signInWithPassword({ email, password:pass });
      if(error) throw new Error(traduire(error));
      return true;
    }
    const us=Store._localGet("akili_users",{});
    if(!us[email]) throw new Error("Aucun compte trouvé.");
    Store.bind({uid:us[email].uid,orgId:us[email].orgId||us[email].uid});
    saveLocal({...us[email]}); return us[email];
  };

  const resetPassword=async(email)=>{
    if(!SB_OK) throw new Error("Disponible une fois Supabase configuré.");
    const {error}=await sb().auth.resetPasswordForEmail(email,{ redirectTo:window.location.origin });
    if(error) throw new Error(traduire(error));
  };

  const logout=async()=>{
    await Store.clear();
    if(SB_OK){ try{ await sb().auth.signOut(); }catch{} setUser(null); }
    else saveLocal(null);
  };

  const upgradePlan=async p=>{
    const u={...user,plan:p}; setUser(u);
    if(SB_OK){ try{ await sb().from("profiles").update({plan:p}).eq("id",user.uid); }catch{} }
    else{
      sessionStorage.setItem("akili_s",JSON.stringify(u));
      const us=Store._localGet("akili_users",{});
      if(us[user.email]){ us[user.email].plan=p; Store._localSet("akili_users",us); }
    }
  };

  return <AuthCtx.Provider value={{user,boot,mode,register,login,logout,upgradePlan,resetPassword}}>{children}</AuthCtx.Provider>;
}

// ─── UTILS ────────────────────────────────────────────────────────
const fmtN  = n=>Number(n||0).toLocaleString("fr-FR");
const fmtM  = n=>{ const v=Number(n||0); return v>=1e6?`${(v/1e6).toFixed(1)}M`:v>=1e3?`${(v/1e3).toFixed(0)}K`:`${Math.round(v)}`; };
const today = ()=>new Date().toLocaleDateString("fr-FR");
const newId = p=>`${p}-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
const SYSTEM = `Tu es AKILI ERP, expert OHADA, gestion stocks, RH/paie et business pour entrepreneurs africains francophones. FCFA, Mobile Money, PME ivoiriennes. Concis et pratique. Rappelle toujours que tes réponses sont indicatives.`;

// ═══════════════════════════════════════════════════════════════════
// MOTEUR COMPTABLE OHADA (SYSCOHADA révisé)
//
// Principe : il n'y a qu'UNE source de vérité, le journal. Le grand
// livre, la balance, le compte de résultat et le bilan n'en sont que
// des lectures différentes, recalculées à chaque affichage. Aucun
// report manuel, donc aucune divergence possible entre les états.
//
// Et les écritures elles-mêmes ne se saisissent pas : chaque facture,
// chaque achat, chaque bulletin de paie les produit automatiquement.
// ═══════════════════════════════════════════════════════════════════

// ─── Plan comptable ───────────────────────────────────────────────
const PLAN_OHADA = {
  // Classe 1 — Capitaux
  "101":"Capital social",            "106":"Réserves",
  "110":"Report à nouveau",          "120":"Résultat net de l'exercice",
  "162":"Emprunts bancaires",
  // Classe 2 — Immobilisations
  "211":"Logiciels et licences",     "221":"Terrains",
  "231":"Bâtiments",                 "241":"Matériel et outillage",
  "245":"Matériel de transport",     "244":"Mobilier de bureau",
  "281":"Amortissements",
  // Classe 3 — Stocks
  "311":"Stocks de marchandises",    "321":"Matières premières",
  "351":"Produits finis",
  // Classe 4 — Tiers
  "401":"Fournisseurs",              "408":"Fournisseurs, factures non parvenues",
  "411":"Clients",                   "416":"Clients douteux",
  "422":"Personnel, rémunérations dues",
  "431":"CNPS",                      "447":"Impôts sur salaires (ITS)",
  "443":"TVA facturée (collectée)",  "445":"TVA déductible sur achats",
  "444":"État, TVA à décaisser",
  // Classe 5 — Trésorerie
  "521":"Banque",                    "531":"Mobile Money",
  "571":"Caisse",
  // Classe 6 — Charges
  "601":"Achats de marchandises",    "603":"Variations de stocks",
  "605":"Autres achats",
  "622":"Loyers et charges locatives","626":"Télécommunications",
  "631":"Frais bancaires",           "641":"Impôts et taxes",
  "661":"Rémunérations du personnel","664":"Charges sociales patronales",
  "681":"Dotations aux amortissements",
  // Classe 7 — Produits
  "701":"Ventes de marchandises",    "706":"Services vendus",
  "707":"Produits accessoires",      "771":"Revenus financiers",
};
const libelleCompte = c => PLAN_OHADA[c] || "Compte " + c;
const classeDe      = c => String(c||"").charAt(0);

// Sens naturel d'un compte : les charges et l'actif augmentent au débit,
// les produits, le passif et les capitaux augmentent au crédit.
const sensNaturel = c => ["2","3","5","6"].includes(classeDe(c)) ? "D"
                       : ["1","7"].includes(classeDe(c))         ? "C"
                       : "M";   // classe 4 : mixte, selon le solde

const Compta = {
  // ── Grand livre : toutes les écritures regroupées par compte ──
  grandLivre(ecritures){
    const m=new Map();
    ecritures.forEach(e=>{
      const c=String(e.compte||"").trim(); if(!c) return;
      if(!m.has(c)) m.set(c,{compte:c,libelle:libelleCompte(c),lignes:[],debit:0,credit:0});
      const g=m.get(c);
      const d=Number(e.debit||0), cr=Number(e.credit||0);
      g.debit+=d; g.credit+=cr;
      g.lignes.push({...e,debit:d,credit:cr});
    });
    return [...m.values()].map(g=>{
      // Les lignes sont rangées de la plus ancienne à la plus récente,
      // avec le solde cumulé après chaque opération — c'est ce que le
      // comptable lit pour pointer un compte.
      const lignes=[...g.lignes].reverse();
      let cum=0;
      lignes.forEach(l=>{ cum += l.debit - l.credit; l.solde=cum; });
      return {...g, lignes, solde:g.debit-g.credit};
    }).sort((a,b)=>a.compte.localeCompare(b.compte));
  },

  // ── Balance générale à six colonnes ──
  balance(ecritures){
    const gl=Compta.grandLivre(ecritures);
    const lignes=gl.map(g=>({
      compte:g.compte, libelle:g.libelle,
      mvtDebit:g.debit, mvtCredit:g.credit,
      soldeDebiteur: g.solde>0? g.solde:0,
      soldeCrediteur:g.solde<0?-g.solde:0,
    }));
    const t=lignes.reduce((a,l)=>({
      mvtDebit:a.mvtDebit+l.mvtDebit, mvtCredit:a.mvtCredit+l.mvtCredit,
      soldeDebiteur:a.soldeDebiteur+l.soldeDebiteur, soldeCrediteur:a.soldeCrediteur+l.soldeCrediteur,
    }),{mvtDebit:0,mvtCredit:0,soldeDebiteur:0,soldeCrediteur:0});
    return {lignes,totaux:t,equilibree:t.mvtDebit===t.mvtCredit&&t.soldeDebiteur===t.soldeCrediteur};
  },

  // ── Compte de résultat : classes 6 et 7 ──
  resultat(ecritures){
    const gl=Compta.grandLivre(ecritures);
    const charges=gl.filter(g=>classeDe(g.compte)==="6")
      .map(g=>({compte:g.compte,libelle:g.libelle,montant:g.debit-g.credit}))
      .filter(x=>x.montant!==0).sort((a,b)=>b.montant-a.montant);
    const produits=gl.filter(g=>classeDe(g.compte)==="7")
      .map(g=>({compte:g.compte,libelle:g.libelle,montant:g.credit-g.debit}))
      .filter(x=>x.montant!==0).sort((a,b)=>b.montant-a.montant);
    const totalCharges =charges.reduce((s,x)=>s+x.montant,0);
    const totalProduits=produits.reduce((s,x)=>s+x.montant,0);
    return {charges,produits,totalCharges,totalProduits,resultat:totalProduits-totalCharges};
  },

  // ── Bilan : classes 1 à 5, plus le résultat de l'exercice ──
  // Le résultat n'est pas saisi : il vient du compte de résultat et
  // s'inscrit au passif. C'est ce qui fait que le bilan s'équilibre
  // tout seul dès que le journal est équilibré.
  bilan(ecritures){
    const gl=Compta.grandLivre(ecritures);
    const par=(pred,sens)=>gl.filter(g=>pred(g.compte))
      .map(g=>({compte:g.compte,libelle:g.libelle,montant:sens==="D"?g.solde:-g.solde}))
      .filter(x=>x.montant>0).sort((a,b)=>b.montant-a.montant);

    const immobilisations=par(c=>classeDe(c)==="2"&&!c.startsWith("28"),"D");
    const amortissements =par(c=>c.startsWith("28"),"C");
    const stocks         =par(c=>classeDe(c)==="3","D");
    const creances       =par(c=>classeDe(c)==="4","D");
    const tresorerieActif=par(c=>classeDe(c)==="5","D");

    const capitaux       =par(c=>classeDe(c)==="1"&&!c.startsWith("16")&&c!=="120","C");
    const dettesFin      =par(c=>c.startsWith("16"),"C");
    const dettes         =par(c=>classeDe(c)==="4","C");
    const tresoreriePassif=par(c=>classeDe(c)==="5","C");

    const res=Compta.resultat(ecritures).resultat;

    const actif=[
      {section:"Immobilisations",      lignes:immobilisations},
      {section:"Amortissements (−)",   lignes:amortissements, negatif:true},
      {section:"Stocks",               lignes:stocks},
      {section:"Créances",             lignes:creances},
      {section:"Trésorerie — actif",   lignes:tresorerieActif},
    ].filter(s=>s.lignes.length);
    const passif=[
      {section:"Capitaux propres",     lignes:capitaux},
      {section:"Dettes financières",   lignes:dettesFin},
      {section:"Dettes circulantes",   lignes:dettes},
      {section:"Trésorerie — passif",  lignes:tresoreriePassif},
    ].filter(s=>s.lignes.length);

    const som=secs=>secs.reduce((s,x)=>s+x.lignes.reduce((a,l)=>a+l.montant,0)*(x.negatif?-1:1),0);
    const totalActif=som(actif);
    const totalPassif=som(passif)+res;
    return {actif,passif,resultat:res,totalActif,totalPassif,
            ecart:totalActif-totalPassif, equilibre:totalActif===totalPassif};
  },

  // ── Contrôles de cohérence ──
  // Ce que vérifierait un expert-comptable avant d'accepter un dossier.
  controles(ecritures){
    const out=[];
    const d=ecritures.reduce((s,e)=>s+Number(e.debit||0),0);
    const c=ecritures.reduce((s,e)=>s+Number(e.credit||0),0);
    if(!ecritures.length) return [{n:"info",m:"Aucune écriture : le dossier est vide."}];
    if(d!==c) out.push({n:"err",m:`Journal déséquilibré de ${fmtN(Math.abs(d-c))} F — débits ${fmtN(d)}, crédits ${fmtN(c)}.`});
    const sansCompte=ecritures.filter(e=>!e.compte).length;
    if(sansCompte) out.push({n:"err",m:`${sansCompte} écriture(s) sans compte imputé.`});
    const horsPlan=[...new Set(ecritures.map(e=>String(e.compte||"")).filter(x=>x&&!PLAN_OHADA[x]))];
    if(horsPlan.length) out.push({n:"warn",m:`Compte(s) hors plan SYSCOHADA : ${horsPlan.join(", ")}.`});
    const sansPiece=ecritures.filter(e=>!e.piece).length;
    if(sansPiece) out.push({n:"warn",m:`${sansPiece} écriture(s) sans numéro de pièce justificative (obligatoire en OHADA).`});
    const b=Compta.bilan(ecritures);
    if(!b.equilibre) out.push({n:"err",m:`Bilan déséquilibré de ${fmtN(Math.abs(b.ecart))} F.`});
    if(!out.length) out.push({n:"ok",m:"Journal équilibré, bilan équilibré, toutes les pièces référencées."});
    return out;
  },
};

// ─── Conversion des devises ───────────────────────────────────────
// 1 EUR = 655,957 FCFA : parité fixe, garantie par le Trésor français,
// inchangée depuis 1999. On peut la figer sans risque.
// Le dollar, lui, flotte : pas de valeur codée en dur qui vieillirait
// mal. Tant que le taux n'est pas saisi, la facture n'est pas
// comptabilisée et l'utilisateur est prévenu — mieux vaut un trou
// signalé qu'un chiffre d'affaires faux.
const PARITE_EUR = 655.957;
const tauxUSD = (orgId) => Number(Store.get(`akili_taux_${orgId}`,{usd:""})?.usd||0);
function versFCFA(montant, devise, orgId){
  const m=Number(montant||0);
  if(!m) return {montant:0,ok:true};
  if(devise==="FCFA"||devise==="XOF") return {montant:Math.round(m),ok:true};
  if(devise==="EUR") return {montant:Math.round(m*PARITE_EUR),ok:true,note:`${fmtN(m)} EUR × ${PARITE_EUR}`};
  if(devise==="USD"){
    const t=tauxUSD(orgId);
    if(!t) return {montant:0,ok:false,raison:"Taux USD non renseigné — onglet OHADA, vue Contrôles."};
    return {montant:Math.round(m*t),ok:true,note:`${fmtN(m)} USD × ${t}`};
  }
  return {montant:0,ok:false,raison:`Devise ${devise} non gérée.`};
}

// ─── Écritures automatiques ───────────────────────────────────────
// Chaque pièce (facture, achat, bulletin) porte un identifiant `src`.
// Reposter la même pièce remplace ses écritures au lieu de les
// dupliquer ; supprimer la pièce les retire. C'est ce qui permet de
// tout générer automatiquement sans jamais créer de doublon.
function posterEcritures(orgId, src, lignes){
  const KEY=`akili_ecrit_${orgId}`;
  const ex=Store.get(KEY,[]).filter(e=>e.src!==src);
  if(!lignes||!lignes.length){ Store.set(KEY,ex); return 0; }
  const nouvelles=lignes
    .filter(l=>Number(l.debit||0)!==0||Number(l.credit||0)!==0)
    .map(l=>({id:uuid(),src,journal:l.journal||"OD",...l}));
  Store.set(KEY,[...nouvelles,...ex]);
  return nouvelles.length;
}
function retirerEcritures(orgId, src){ return posterEcritures(orgId, src, []); }

// Une facture de vente : le client doit le TTC, l'entreprise gagne le HT,
// et l'État attend la TVA collectée.
function ecrituresVente({date,libelle,piece,montantHT,tauxTVA=18,compteProduit="706",encaisse=false,compteTresorerie="521"}){
  const ht=Math.round(Number(montantHT||0));
  const tva=Math.round(ht*Number(tauxTVA||0)/100);
  const ttc=ht+tva;
  const J="VT";   // journal des ventes
  const l=[
    {date,libelle,piece,journal:J,compte:encaisse?compteTresorerie:"411",debit:ttc,credit:0},
    {date,libelle,piece,journal:J,compte:compteProduit,debit:0,credit:ht},
  ];
  if(tva) l.push({date,libelle:`TVA collectée — ${libelle}`,piece,journal:J,compte:"443",debit:0,credit:tva});
  return l;
}

// Un achat : la charge au débit, la TVA récupérable au débit, la dette
// fournisseur au crédit.
function ecrituresAchat({date,libelle,piece,montantHT,tauxTVA=18,compteCharge="601",regle=false,compteTresorerie="521"}){
  const ht=Math.round(Number(montantHT||0));
  const tva=Math.round(ht*Number(tauxTVA||0)/100);
  const ttc=ht+tva;
  const J="AC";   // journal des achats
  const l=[{date,libelle,piece,journal:J,compte:compteCharge,debit:ht,credit:0}];
  if(tva) l.push({date,libelle:`TVA déductible — ${libelle}`,piece,journal:J,compte:"445",debit:tva,credit:0});
  l.push({date,libelle,piece,journal:J,compte:regle?compteTresorerie:"401",debit:0,credit:ttc});
  return l;
}

// Un bulletin de paie : la charge est le coût total employeur ; se
// répartissent le net à payer, les cotisations CNPS et l'ITS.
function ecrituresPaie({date,libelle,piece,brut,cnpsSalarie,cnpsPatronal,its,net}){
  const J="PA";   // journal de paie
  return [
    {date,libelle,piece,journal:J,compte:"661",debit:Math.round(brut),credit:0},
    {date,libelle:`Charges patronales — ${libelle}`,piece,journal:J,compte:"664",debit:Math.round(cnpsPatronal),credit:0},
    {date,libelle:`Net à payer — ${libelle}`,piece,journal:J,compte:"422",debit:0,credit:Math.round(net)},
    {date,libelle:`CNPS — ${libelle}`,piece,journal:J,compte:"431",debit:0,credit:Math.round(cnpsSalarie)+Math.round(cnpsPatronal)},
    {date,libelle:`ITS — ${libelle}`,piece,journal:J,compte:"447",debit:0,credit:Math.round(its)},
  ];
}

// ─── BASE UI ──────────────────────────────────────────────────────
const Btn=({children,onClick,variant="primary",disabled,full,sm,style={}})=>(
  <button onClick={onClick} disabled={disabled} style={{padding:sm?"7px 14px":"12px 20px",borderRadius:8,cursor:disabled?"not-allowed":"pointer",fontFamily:"inherit",fontSize:sm?15:17,fontWeight:700,transition:"all .18s",width:full?"100%":"auto",background:variant==="primary"?`linear-gradient(135deg,${T.accent},${T.accentD})`:variant==="danger"?T.red:variant==="green"?T.green:variant==="blue"?T.blue:variant==="ghost"?"transparent":T.light,color:variant==="primary"?"#000":variant==="ghost"?T.muted:T.text,border:variant==="ghost"?`1px solid ${T.border}`:"none",opacity:disabled?.5:1,...style}}>{children}</button>
);
const Inp=({label,value,onChange,placeholder,type="text",required,error,style={}})=>(
  <div style={{marginBottom:10}}>
    {label&&<div style={{fontSize:14,color:T.muted,marginBottom:3,textTransform:"uppercase",letterSpacing:".5px"}}>{label}{required&&<span style={{color:T.red}}> *</span>}</div>}
    <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{width:"100%",background:T.bg,border:`1px solid ${error?T.red:T.border}`,borderRadius:8,padding:"12px 16px",color:T.text,fontSize:17,outline:"none",boxSizing:"border-box",fontFamily:"inherit",...style}}/>
    {error&&<div style={{fontSize:14,color:T.red,marginTop:3}}>⚠ {error}</div>}
  </div>
);
const Sel=({label,value,onChange,options,required})=>(
  <div style={{marginBottom:10}}>
    {label&&<div style={{fontSize:14,color:T.muted,marginBottom:3,textTransform:"uppercase",letterSpacing:".5px"}}>{label}{required&&<span style={{color:T.red}}> *</span>}</div>}
    <select value={value} onChange={e=>onChange(e.target.value)} style={{width:"100%",background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"12px 16px",color:T.text,fontSize:17,outline:"none",fontFamily:"inherit"}}>
      {options.map(o=><option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
    </select>
  </div>
);
const Card=({children,style={},onClick})=>(<div onClick={onClick} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:14,...style}}>{children}</div>);
const Badge=({label,color})=>(<span style={{padding:"3px 10px",borderRadius:20,fontSize:14,fontWeight:700,background:color+"22",color,border:`1px solid ${color}33`}}>{label}</span>);
const Toast=({n})=>n?(<div style={{position:"fixed",top:12,left:"50%",transform:"translateX(-50%)",background:n.color,color:"#fff",padding:"12px 20px",borderRadius:20,fontSize:16,fontWeight:700,zIndex:999,boxShadow:"0 4px 24px #0008",maxWidth:"90vw",textAlign:"center"}}>{n.msg}</div>):null;
const Pager=({total,page,pp,onPage})=>{ const pages=Math.ceil(total/pp); if(pages<=1) return null; return(<div style={{display:"flex",justifyContent:"center",gap:6,padding:"13px 0"}}><Btn variant="ghost" sm disabled={page===0} onClick={()=>onPage(page-1)}>←</Btn><span style={{fontSize:15,color:T.muted,alignSelf:"center"}}>{page+1}/{pages}</span><Btn variant="ghost" sm disabled={page>=pages-1} onClick={()=>onPage(page+1)}>→</Btn></div>); };
const KPI=({icon,label,value,sub,color,onClick})=>(<Card style={{padding:16,background:T.card2,border:`1px solid ${color}18`,cursor:onClick?"pointer":"default"}} onClick={onClick}><div style={{fontSize:20,marginBottom:3}}>{icon}</div><div style={{fontSize:19,fontWeight:800,color,lineHeight:1,marginBottom:2}}>{value}</div><div style={{fontSize:15,fontWeight:700,color:T.text}}>{label}</div>{sub&&<div style={{fontSize:13,color:T.muted,marginTop:1}}>{sub}</div>}</Card>);

// ─── DISCLAIMER ───────────────────────────────────────────────────
function Disclaimer({onAccept}){
  const [c1,setC1]=useState(false); const [c2,setC2]=useState(false); const [c3,setC3]=useState(false);
  const ok=c1&&c2&&c3;
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.88)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <Card style={{width:"100%",maxWidth:440,padding:24,maxHeight:"92vh",overflowY:"auto"}}>
        <div style={{textAlign:"center",marginBottom:18}}><div style={{fontSize:38,marginBottom:8}}>⚖️</div><div style={{fontSize:20,fontWeight:800}}>Conditions d'utilisation</div><div style={{fontSize:15,color:T.muted,marginTop:4}}>À lire avant d'utiliser AKILI ERP</div></div>
        {[[T.red,"⚠️ Avertissement","Les documents, conseils et états financiers générés par AKILI ERP sont fournis à titre indicatif uniquement. Ils ne constituent pas un conseil juridique, comptable ou fiscal certifié. Les contrats doivent être validés par un juriste, les écritures OHADA par un expert-comptable agréé ONECCA-CI, et les déclarations fiscales par un professionnel DGI."],
          [T.orange,"📋 Responsabilité",EDITEUR.nom+" ne peut être tenu responsable des erreurs dans les documents générés par l'IA, des redressements fiscaux, des litiges contractuels, ni des pertes financières résultant d'une utilisation sans validation professionnelle."],
          [T.green,"✅ Engagement","En acceptant, vous vous engagez à faire valider les documents importants par des professionnels qualifiés, à conserver vos pièces justificatives 10 ans (OHADA), et à soumettre vos déclarations fiscales via les canaux officiels DGI agréés."]
        ].map(([col,titre,texte])=>(
          <div key={titre} style={{background:col+"12",border:`1px solid ${col}33`,borderRadius:9,padding:16,marginBottom:10}}>
            <div style={{fontSize:15,fontWeight:700,color:col,marginBottom:6}}>{titre}</div>
            <div style={{fontSize:15,color:T.text,lineHeight:1.65}}>{texte}</div>
          </div>
        ))}
        <div style={{marginBottom:18}}>
          <div style={{fontSize:15,fontWeight:700,marginBottom:10}}>Confirmez votre accord :</div>
          {[[c1,setC1,"Les documents générés sont indicatifs et doivent être validés par des professionnels qualifiés."],
            [c2,setC2,`${EDITEUR.nom} n'est pas responsable des erreurs dans les documents générés par l'IA.`],
            [c3,setC3,"J'accepte les conditions et m'engage à utiliser AKILI ERP de manière responsable."]
          ].map(([checked,set,txt],i)=>(
            <div key={i} onClick={()=>set(!checked)} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"12px 14px",background:checked?T.green+"12":T.light,borderRadius:8,marginBottom:7,border:`1px solid ${checked?T.green:T.border}`,cursor:"pointer",transition:"all .2s"}}>
              <div style={{width:22,height:22,borderRadius:4,flexShrink:0,marginTop:1,background:checked?T.green:T.bg,border:`2px solid ${checked?T.green:T.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,color:"#fff"}}>{checked?"✓":""}</div>
              <span style={{fontSize:15,color:T.text,lineHeight:1.6}}>{txt}</span>
            </div>
          ))}
        </div>
        <Btn onClick={onAccept} disabled={!ok} full style={{padding:17}}>{ok?"✅ J'accepte — Accéder à AKILI ERP":"Cochez les 3 cases pour continuer"}</Btn>
        <div style={{textAlign:"center",marginTop:12,fontSize:13,color:T.muted,lineHeight:1.7}}>
          <div style={{fontWeight:700,color:T.text,fontSize:14}}>{EDITEUR.nom}</div>
          <div>Capital {EDITEUR.capital} · RCCM {EDITEUR.rccm}</div>
          <div>NCC {EDITEUR.ncc} · IDU {EDITEUR.idu}</div>
          <div>{EDITEUR.siege}</div>
          <div>{EDITEUR.tel} · {EDITEUR.email} · {EDITEUR.site}</div>
          <div style={{marginTop:7,fontSize:12}}>{EDITEUR.droit}</div>
          <div style={{marginTop:7,fontSize:13}}>
            <a href="https://akili.africavit.com/cgu.html" target="_blank" rel="noopener" style={{color:T.accent}}>Conditions d'utilisation</a>
            {" · "}
            <a href="https://akili.africavit.com/cgv.html" target="_blank" rel="noopener" style={{color:T.accent}}>Conditions de vente</a>
            {" · "}
            <a href="https://akili.africavit.com/politique-confidentialite.html" target="_blank" rel="noopener" style={{color:T.accent}}>Confidentialité</a>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────
// ─── ECRAN DE DEMARRAGE ───────────────────────────────────────────
function Splash(){
  return(
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
      <div style={{width:60,height:60,borderRadius:18,background:`linear-gradient(135deg,${T.accent},${T.accentD})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:30}}>🌍</div>
      <div style={{fontSize:22,fontWeight:800,color:T.text}}>AKILI ERP</div>
      <div style={{display:"flex",gap:5}}>{[0,1,2].map(i=><div key={i} style={{width:7,height:7,borderRadius:"50%",background:T.accent,animation:"bounce 1.2s infinite",animationDelay:`${i*.2}s`}}/>)}</div>
      <div style={{fontSize:14,color:T.muted}}>Connexion sécurisée…</div>
      <style>{CSS}</style>
    </div>
  );
}

// Bandeau discret : rappelle qu'on est en demo tant que Supabase n'est pas configure
function ModeBadge({mode}){
  if(mode!=="demo") return null;
  return(
    <div style={{position:"fixed",bottom:10,left:"50%",transform:"translateX(-50%)",background:T.card2,border:`1px solid ${T.border}`,borderRadius:20,padding:"7px 16px",fontSize:13,color:T.muted,zIndex:50,maxWidth:"92vw",textAlign:"center"}}>
      Mode démo — données sur cet appareil uniquement
    </div>
  );
}

export default function App(){ return <AuthProvider><AppInner/></AuthProvider>; }
function AppInner(){
  const {user,boot,mode}=useAuth();
  const [disc,setDisc]=useState(()=>!!localStorage.getItem("akili_disc"));
  if(boot) return <Splash/>;
  if(!user) return <><AuthScreen/><ModeBadge mode={mode}/></>;
  if(!disc) return <><Disclaimer onAccept={()=>{localStorage.setItem("akili_disc","1");setDisc(true);}}/><style>{CSS}</style></>;
  return <Dashboard/>;
}

// ─── AUTH SCREEN ──────────────────────────────────────────────────
function AuthScreen(){
  const {login,register}=useAuth();
  const [mode,setMode]=useState("login");
  const [email,setEmail]=useState(""); const [pass,setPass]=useState("");
  const [name,setName]=useState(""); const [ent,setEnt]=useState("");
  const [errors,setErrors]=useState({}); const [msg,setMsg]=useState(""); const [load,setLoad]=useState(false);
  const validate=()=>{ const e={}; if(!email) e.email="Email requis"; else if(!/\S+@\S+\.\S+/.test(email)) e.email="Format invalide"; if(!pass) e.pass="Requis"; else if(pass.length<6) e.pass="6 caractères min."; if(mode==="register"&&!name) e.name="Nom requis"; setErrors(e); return!Object.keys(e).length; };
  const handle=async()=>{ setMsg(""); if(!validate()) return; setLoad(true); try{ if(mode==="login") await login(email,pass); else{ await register(email,pass,name,ent); setMsg("✅ Compte créé !"); } }catch(e){ setErrors({global:e.message}); } setLoad(false); };
  return(
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backgroundImage:`radial-gradient(ellipse at 20% 50%,${T.accentG} 0%,transparent 55%)`}}>
      <div style={{width:"100%",maxWidth:360}}>
        <div style={{textAlign:"center",marginBottom:22}}>
          <div style={{width:60,height:60,borderRadius:18,background:`linear-gradient(135deg,${T.accent},${T.accentD})`,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:30,marginBottom:12}}>🌍</div>
          <div style={{fontSize:26,fontWeight:800,color:T.text}}>AKILI ERP</div>
          <div style={{fontSize:15,color:T.muted,marginTop:3}}>Gestion · Stocks · RH · OHADA · IA</div>
        </div>
        <Card style={{padding:22}}>
          <div style={{fontWeight:800,fontSize:18,marginBottom:14}}>{mode==="login"?"Connexion":"Créer un compte"}</div>
          {mode==="register"&&<Inp label="Nom complet" value={name} onChange={setName} placeholder="DIBY Honoré" required error={errors.name}/>}
          {mode==="register"&&<Inp label="Entreprise" value={ent} onChange={setEnt} placeholder="Nom de votre entreprise"/>}
          <Inp label="Email" value={email} onChange={v=>{setEmail(v);setErrors(p=>({...p,email:""}));}} placeholder="vous@imedia.ci" type="email" required error={errors.email}/>
          <Inp label="Mot de passe" value={pass} onChange={v=>{setPass(v);setErrors(p=>({...p,pass:""}));}} placeholder="Min. 6 caractères" type="password" required error={errors.pass}/>
          {errors.global&&<div style={{padding:"9px 13px",background:T.red+"15",border:`1px solid ${T.red}33`,borderRadius:7,color:T.red,fontSize:16,marginBottom:10}}>⚠ {errors.global}</div>}
          {msg&&<div style={{padding:"9px 13px",background:T.green+"15",border:`1px solid ${T.green}33`,borderRadius:7,color:T.green,fontSize:16,marginBottom:10}}>{msg}</div>}
          <Btn onClick={handle} disabled={load} full style={{padding:16,marginTop:4}}>{load?"⏳...":mode==="login"?"🔐 Se connecter":"✨ Créer mon compte"}</Btn>
          <div style={{marginTop:12,textAlign:"center",fontSize:16,color:T.muted}}>
            {mode==="login"?"Pas encore de compte ? ":"Déjà un compte ? "}
            <span onClick={()=>{setMode(mode==="login"?"register":"login");setErrors({});setMsg("");}} style={{color:T.accent,cursor:"pointer",fontWeight:700}}>{mode==="login"?"S'inscrire":"Se connecter"}</span>
          </div>
        </Card>
      </div>
      <style>{CSS}</style>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────
function Dashboard(){
  const {user,logout,upgradePlan,mode}=useAuth();
  const sv=useSync();   // compteur de mises a jour distantes (Firestore)
  const [tab,setTab]=useState("home");
  const [notif,setNotif]=useState(null);
  const nRef=useRef(null);
  const notify=useCallback((msg,color=T.green)=>{ if(nRef.current) clearTimeout(nRef.current); setNotif({msg,color}); nRef.current=setTimeout(()=>setNotif(null),3000); },[]);
  const orgId=user.orgId||user.uid;
  const plan=user.plan||"starter";
  const tabs=[
    {id:"home",    icon:"📊",label:"Tableau"},
    {id:"docs",    icon:"📄",label:"Documents"},
    {id:"clients", icon:"👥",label:"Clients"},
    {id:"stocks",  icon:"📦",label:"Stocks"},
    {id:"rh",      icon:"👔",label:"RH/Paie"},
    {id:"achats",  icon:"🧾",label:"Achats"},
    {id:"projets", icon:"📁",label:"Projets"},
    {id:"compta",  icon:"📒",label:"OHADA"},
    {id:"sign",    icon:"✍️",label:"Signature"},
    {id:"chat",    icon:"🤖",label:"IA"},
  ];
  return(
    <div style={{minHeight:"100vh",background:T.bg,color:T.text,display:"flex",flexDirection:"column"}}>
      <Toast n={notif}/>
      <div style={{background:T.card,borderBottom:`1px solid ${T.border}`,padding:"12px 14px",display:"flex",alignItems:"center",gap:9,position:"sticky",top:0,zIndex:20}}>
        <div style={{width:34,height:34,borderRadius:7,background:`linear-gradient(135deg,${T.accent},${T.accentD})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17}}>🌍</div>
        <div>
          <div style={{fontWeight:800,fontSize:15,display:"flex",alignItems:"center",gap:5}}>
            AKILI ERP <span style={{fontSize:13,padding:"1px 6px",borderRadius:4,background:PLANS[plan].color+"22",color:PLANS[plan].color}}>{PLANS[plan].label}</span>
          </div>
          <div style={{fontSize:13,color:T.muted}}>{user.entreprise||user.name}</div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:6,alignItems:"center"}}>
          <span style={{fontSize:13,color:T.muted}}>⚡{QM.left(user.uid,plan)===999?"∞":QM.left(user.uid,plan)}</span>
          <button onClick={logout} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:6,padding:"3px 9px",color:T.muted,fontSize:13,cursor:"pointer"}}>Déco</button>
        </div>
      </div>
      <div style={{display:"flex",background:T.card,borderBottom:`1px solid ${T.border}`,overflowX:"auto",
                   WebkitOverflowScrolling:"touch",scrollbarWidth:"none",
                   maskImage:"linear-gradient(90deg,#000 0,#000 calc(100% - 22px),transparent 100%)",
                   WebkitMaskImage:"linear-gradient(90deg,#000 0,#000 calc(100% - 22px),transparent 100%)"}}>
        {tabs.map(t=>(<button key={t.id} onClick={()=>setTab(t.id)} style={{flex:"0 0 auto",minWidth:56,padding:"10px 5px",background:"none",border:"none",cursor:"pointer",borderBottom:tab===t.id?`2px solid ${T.accent}`:"2px solid transparent",color:tab===t.id?T.accent:T.muted,fontSize:12.5,fontWeight:tab===t.id?700:400,display:"flex",flexDirection:"column",alignItems:"center",gap:2,transition:"all .2s"}}><span style={{fontSize:18}}>{t.icon}</span>{t.label}</button>))}
      </div>
      <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
        {tab==="home"    && <HomeTab key={sv}    orgId={orgId} user={user} plan={plan} onUpgrade={()=>{}}/>}
        {tab==="docs"    && <DocsTab key={sv}    orgId={orgId} user={user} plan={plan} notify={notify} onUpgrade={()=>{}}/>}
        {tab==="clients" && <ClientsTab key={sv} orgId={orgId} user={user} notify={notify}/>}
        {tab==="stocks"  && <StocksTab key={sv}  orgId={orgId} user={user} notify={notify}/>}
        {tab==="rh"      && <RHTab key={sv}      orgId={orgId} user={user} notify={notify}/>}
        {tab==="achats"  && <AchatsTab key={sv}  orgId={orgId} user={user} notify={notify}/>}
        {tab==="projets" && <ProjetsTab key={sv} orgId={orgId} user={user} notify={notify}/>}
        {tab==="compta"  && <ComptaTab key={sv}  orgId={orgId} user={user} notify={notify}/>}
        {tab==="sign"    && <SignatureTab key={sv} orgId={orgId} user={user} notify={notify}/>}
        {tab==="chat"    && <ChatTab key={sv}    user={user} plan={plan} notify={notify} onUpgrade={()=>{}}/>}
      </div>
      <style>{CSS}</style>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// OPTION A — HOME TAB avec KPIs AVANCÉS
// ══════════════════════════════════════════════════════════════════
function HomeTab({orgId,user,plan,onUpgrade}){
  const docs    = Store.get(`akili_docs_${orgId}`,[]);
  const clients = Store.get(`akili_clients_${orgId}`,[]);
  const ecrit   = Store.get(`akili_ecrit_${orgId}`,[]);
  const stocks  = Store.get(`akili_stocks_${orgId}`,[]);
  const employes= Store.get(`akili_employes_${orgId}`,[]);

  // ── KPI DE BASE ──────────────────────────────────────────────
  const totalCA     = docs.filter(d=>d.type==="facture").reduce((s,d)=>s+Number(d.montant||0),0);
  const totalDevis  = docs.filter(d=>d.type==="devis").reduce((s,d)=>s+Number(d.montant||0),0);
  const produits    = ecrit.filter(e=>e.compte?.startsWith("7")).reduce((s,e)=>s+Number(e.credit||0),0);
  const charges     = ecrit.filter(e=>e.compte?.startsWith("6")).reduce((s,e)=>s+Number(e.debit||0),0);
  const resultat    = produits - charges;
  const encaiss     = ecrit.filter(e=>e.compte==="521"||e.compte==="571").reduce((s,e)=>s+Number(e.credit||0)-Number(e.debit||0),0);

  // ── KPI AVANCÉS (Option A) ────────────────────────────────────
  const nbDevis    = docs.filter(d=>d.type==="devis").length;
  const nbFactures = docs.filter(d=>d.type==="facture").length;
  // Taux de conversion devis → facture
  const tauxConversion = nbDevis > 0 ? Math.round((nbFactures/nbDevis)*100) : 0;

  // Charges fixes mensuelles estimées (personnel + frais fixes)
  const chargesMens = charges > 0 ? Math.round(charges / 6) : 0;
  // Marge brute moyenne par vente (si CA et factures > 0)
  const margeMoyenne = nbFactures > 0 && totalCA > 0 ? Math.round(totalCA / nbFactures) : 0;
  // Point mort mensuel = charges fixes / taux de marge
  const margeRate = totalCA > 0 ? (resultat / totalCA) : 0;
  const pointMort = margeRate > 0 ? Math.round(chargesMens / margeRate) : 0;

  // Prévision trésorerie 30/60/90 jours
  const tresoActuelle = encaiss;
  const revMoyen  = totalCA > 0 ? totalCA/6 : 0;
  const chaMoyen  = chargesMens;
  const prev30    = Math.round(tresoActuelle + revMoyen - chaMoyen);
  const prev60    = Math.round(tresoActuelle + revMoyen*2 - chaMoyen*2);
  const prev90    = Math.round(tresoActuelle + revMoyen*3 - chaMoyen*3);

  // Alerte stock faible
  const stocksAlerte = stocks.filter(s=>Number(s.quantite||0)<=Number(s.seuilAlerte||0));
  // Masse salariale
  const masseSalariale = employes.reduce((s,e)=>s+Number(e.salaire||0),0);

  // Graphique trésorerie prévisionnelle
  const prevData = [
    {m:"Auj.",v:tresoActuelle,color:T.blue},
    {m:"J+30",v:prev30,      color:prev30>=0?T.green:T.red},
    {m:"J+60",v:prev60,      color:prev60>=0?T.green:T.red},
    {m:"J+90",v:prev90,      color:prev90>=0?T.green:T.red},
  ];

  const typeData=[
    {name:"Devis",   val:nbDevis,    fill:T.accent},
    {name:"Factures",val:nbFactures, fill:T.green},
    {name:"Contrats",val:docs.filter(d=>d.type==="contrat").length, fill:T.blue},
  ].filter(d=>d.val>0);

  return(
    <div style={{flex:1,overflowY:"auto",padding:17}}>
      <div style={{marginBottom:12}}>
        <div style={{fontSize:19,fontWeight:800}}>Tableau de bord</div>
        <div style={{fontSize:14,color:T.muted}}>{today()} · {user.entreprise||"Mon entreprise"} · OHADA</div>
      </div>

      {/* KPIs de base */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
        <KPI icon="💰" label="CA Facturé"  value={`${fmtM(totalCA)}F`}          sub={`${nbFactures} factures`}              color={T.green}/>
        <KPI icon="📋" label="Devis émis"  value={`${fmtM(totalDevis)}F`}        sub={`${nbDevis} devis`}                    color={T.accent}/>
        <KPI icon="📈" label={resultat>=0?"Bénéfice":"Déficit"} value={`${fmtM(Math.abs(resultat))}F`} sub="Produits - Charges" color={resultat>=0?T.green:T.red}/>
        <KPI icon="🏦" label="Trésorerie"  value={`${fmtM(Math.abs(encaiss))}F`} sub={encaiss>=0?"Positive":"Négative"}      color={encaiss>=0?T.green:T.red}/>
      </div>

      {/* ── KPIs AVANCÉS (Option A) ── */}
      <div style={{fontSize:15,fontWeight:700,color:T.accent,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
        📊 Indicateurs avancés
        <span style={{fontSize:13,color:T.muted,fontWeight:400}}>Calculés automatiquement</span>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginBottom:10}}>
        <Card style={{padding:14,background:T.card2,border:`1px solid ${T.cyan}22`}}>
          <div style={{fontSize:22,marginBottom:3}}>🎯</div>
          <div style={{fontSize:20,fontWeight:800,color:T.cyan}}>{tauxConversion}%</div>
          <div style={{fontSize:14,fontWeight:700,color:T.text}}>Taux conversion</div>
          <div style={{fontSize:12,color:T.muted}}>Devis → Facture</div>
          <div style={{background:T.border,borderRadius:10,height:3,marginTop:5}}>
            <div style={{height:"100%",width:`${tauxConversion}%`,background:tauxConversion>=50?T.green:tauxConversion>=25?T.accent:T.red,borderRadius:10}}/>
          </div>
        </Card>
        <Card style={{padding:14,background:T.card2,border:`1px solid ${T.orange}22`}}>
          <div style={{fontSize:22,marginBottom:3}}>⚖️</div>
          <div style={{fontSize:18,fontWeight:800,color:T.orange}}>{pointMort>0?`${fmtM(pointMort)}F`:"N/A"}</div>
          <div style={{fontSize:14,fontWeight:700,color:T.text}}>Point mort/mois</div>
          <div style={{fontSize:12,color:T.muted}}>CA min. pour équilibrer</div>
          {pointMort>0&&totalCA>0&&<div style={{fontSize:12,color:pointMort<=totalCA/6?T.green:T.red,marginTop:2}}>{pointMort<=totalCA/6?"✓ Atteint":"⚠ Non atteint"}</div>}
        </Card>
        <Card style={{padding:14,background:T.card2,border:`1px solid ${T.purple}22`}}>
          <div style={{fontSize:22,marginBottom:3}}>👥</div>
          <div style={{fontSize:18,fontWeight:800,color:T.purple}}>{fmtM(masseSalariale)}F</div>
          <div style={{fontSize:14,fontWeight:700,color:T.text}}>Masse salariale</div>
          <div style={{fontSize:12,color:T.muted}}>{employes.length} employé(s)</div>
        </Card>
      </div>

      {/* Prévision trésorerie */}
      <Card style={{marginBottom:10,padding:17}}>
        <div style={{fontSize:15,fontWeight:700,marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
          🔮 Prévision trésorerie
          <span style={{fontSize:13,color:T.muted,fontWeight:400}}>30 · 60 · 90 jours</span>
        </div>
        {totalCA===0?(
          <div style={{textAlign:"center",padding:"16px 0",color:T.muted,fontSize:15}}>Ajoutez des factures et écritures pour voir les prévisions</div>
        ):(
          <>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:7,marginBottom:10}}>
              {prevData.map(d=>(
                <div key={d.m} style={{textAlign:"center",padding:"10px 8px",background:T.card2,borderRadius:8,border:`1px solid ${d.color}22`}}>
                  <div style={{fontSize:13,color:T.muted,marginBottom:3}}>{d.m}</div>
                  <div style={{fontSize:16,fontWeight:800,color:d.color}}>{fmtM(Math.abs(d.v))}F</div>
                  <div style={{fontSize:12,color:d.v>=0?T.green:T.red}}>{d.v>=0?"▲":"▼"}</div>
                </div>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={80}>
              <AreaChart data={prevData}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border}/>
                <XAxis dataKey="m" tick={{fill:T.muted,fontSize:13}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:T.muted,fontSize:12}} axisLine={false} tickLine={false} tickFormatter={v=>`${fmtM(v)}F`}/>
                <Tooltip contentStyle={{background:T.card,border:`1px solid ${T.border}`,borderRadius:8,fontSize:14}} formatter={v=>`${fmtN(v)} FCFA`}/>
                <Area type="monotone" dataKey="v" stroke={T.accent} fill={T.accentG} strokeWidth={2} name="Trésorerie"/>
              </AreaChart>
            </ResponsiveContainer>
          </>
        )}
      </Card>

      {/* Alertes stocks */}
      {stocksAlerte.length>0&&(
        <Card style={{marginBottom:10,padding:16,border:`1px solid ${T.red}33`}}>
          <div style={{fontSize:15,fontWeight:700,color:T.red,marginBottom:8}}>🚨 Alertes stocks ({stocksAlerte.length})</div>
          {stocksAlerte.slice(0,3).map(s=>(
            <div key={s.id} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${T.border}`,fontSize:15}}>
              <span style={{color:T.text}}>{s.nom}</span>
              <span style={{color:T.red,fontWeight:700}}>{s.quantite} {s.unite} — Seuil: {s.seuilAlerte}</span>
            </div>
          ))}
        </Card>
      )}

      {/* Graphique docs */}
      {typeData.length>0&&(
        <Card style={{marginBottom:10,padding:16}}>
          <div style={{fontSize:15,fontWeight:700,marginBottom:8}}>📄 Documents par type</div>
          <ResponsiveContainer width="100%" height={80}>
            <BarChart data={typeData}>
              <XAxis dataKey="name" tick={{fill:T.muted,fontSize:13}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:T.muted,fontSize:13}} axisLine={false} tickLine={false} allowDecimals={false}/>
              <Tooltip contentStyle={{background:T.card,border:`1px solid ${T.border}`,borderRadius:8,fontSize:15}} cursor={{fill:T.light}}/>
              <Bar dataKey="val" name="Nombre" radius={[4,4,0,0]}>{typeData.map((d,i)=><Cell key={i} fill={d.fill}/>)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Disclaimer rappel */}
      <Card style={{padding:13,border:`1px solid ${T.accent}18`}}>
        <div style={{fontSize:13,color:T.muted,lineHeight:1.6}}>
          {enPhaseTest() && <div style={{marginBottom:9,paddingBottom:9,borderBottom:`1px solid ${T.border}`}}>
            🎁 <b style={{color:T.accent}}>Phase de test</b> : toutes les options sont gratuites jusqu'au 21 novembre 2026
            <span style={{color:T.muted}}> — encore {joursRestants()} jour{joursRestants()>1?"s":""}. Vos données sont conservées ensuite.</span>
          </div>}
          ⚠️ <b style={{color:T.accent}}>Rappel légal</b> : Documents indicatifs — faites valider par des professionnels qualifiés.
          <div style={{marginTop:5,fontSize:12,color:T.muted}}>
            Édité par {EDITEUR.nom} · RCCM {EDITEUR.rccm} · NCC {EDITEUR.ncc} · {EDITEUR.site}
          </div>
        </div>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// OPTION C.1 — GESTION DES STOCKS
// ══════════════════════════════════════════════════════════════════
function StocksTab({orgId,user,notify}){
  const KEY=`akili_stocks_${orgId}`;
  const MVTS=`akili_mvts_${orgId}`;
  const [stocks,  setStocks] =useState(()=>Store.get(KEY,[]));
  const [mouvts,  setMouvts] =useState(()=>Store.get(MVTS,[]));
  const [view,    setView]   =useState("liste"); // liste | form | mouvements
  const [search,  setSearch] =useState("");
  const [page,    setPage]   =useState(0);
  const [editId,  setEditId] =useState(null);
  const [errors,  setErrors] =useState({});
  const [form,    setForm]   =useState({nom:"",categorie:"",quantite:"",unite:"unité",prixAchat:"",prixVente:"",seuilAlerte:"",fournisseur:""});
  const [mvtForm, setMvtForm]=useState({produitId:"",type:"entree",quantite:"",motif:"",date:today()});
  const [mvtErr,  setMvtErr] =useState({});
  const PP=10;

  const saveS=a=>{setStocks(a);Store.set(KEY,a);};
  const saveM=a=>{setMouvts(a);Store.set(MVTS,a);};

  const validateProd=()=>{
    const e={};
    if(!form.nom.trim()) e.nom="Nom requis";
    if(!form.quantite||isNaN(Number(form.quantite))||Number(form.quantite)<0) e.quantite="Quantité valide requise";
    if(form.prixAchat&&isNaN(Number(form.prixAchat))) e.prixAchat="Prix invalide";
    if(form.prixVente&&isNaN(Number(form.prixVente))) e.prixVente="Prix invalide";
    setErrors(e); return!Object.keys(e).length;
  };

  const addProd=()=>{
    if(!validateProd()) return;
    if(editId){ saveS(stocks.map(s=>s.id===editId?{...form,id:editId}:s)); notify("✅ Produit modifié"); }
    else{ saveS([{...form,id:newId("PRD"),createdAt:today()},...stocks]); notify("✅ Produit ajouté"); }
    setForm({nom:"",categorie:"",quantite:"",unite:"unité",prixAchat:"",prixVente:"",seuilAlerte:"",fournisseur:""});
    setErrors({}); setEditId(null); setView("liste");
  };

  const validateMvt=()=>{
    const e={};
    if(!mvtForm.produitId) e.produit="Sélectionnez un produit";
    if(!mvtForm.quantite||isNaN(Number(mvtForm.quantite))||Number(mvtForm.quantite)<=0) e.quantite="Quantité valide requise";
    setMvtErr(e); return!Object.keys(e).length;
  };

  const addMvt=()=>{
    if(!validateMvt()) return;
    const prod=stocks.find(s=>s.id===mvtForm.produitId);
    if(!prod){ setMvtErr({produit:"Produit introuvable"}); return; }
    const delta=mvtForm.type==="entree"?Number(mvtForm.quantite):-Number(mvtForm.quantite);
    const newQty=Number(prod.quantite||0)+delta;
    if(newQty<0){ setMvtErr({quantite:"Stock insuffisant (disponible: "+prod.quantite+")"}); return; }
    saveS(stocks.map(s=>s.id===mvtForm.produitId?{...s,quantite:newQty}:s));
    const mvt={...mvtForm,id:newId("MVT"),produitNom:prod.nom,ancienStock:Number(prod.quantite),nouveauStock:newQty};
    saveM([mvt,...mouvts]);
    // Inventaire permanent : une entrée augmente le stock (311) en
    // contrepartie du compte de variation (603), une sortie fait
    // l'inverse. Le résultat n'est juste que si les deux existent.
    const valeur=Math.round(Math.abs(delta)*Number(prod.prixAchat||0));
    if(valeur>0){
      const lib=`${mvtForm.type==="entree"?"Entrée":"Sortie"} stock — ${prod.nom}${mvtForm.motif?` (${mvtForm.motif})`:""}`;
      posterEcritures(orgId,mvt.id, mvtForm.type==="entree"
        ? [{date:mvtForm.date,libelle:lib,piece:mvt.id,journal:"OD",compte:"311",debit:valeur,credit:0},
           {date:mvtForm.date,libelle:lib,piece:mvt.id,journal:"OD",compte:"603",debit:0,credit:valeur}]
        : [{date:mvtForm.date,libelle:lib,piece:mvt.id,journal:"OD",compte:"603",debit:valeur,credit:0},
           {date:mvtForm.date,libelle:lib,piece:mvt.id,journal:"OD",compte:"311",debit:0,credit:valeur}]);
    }
    setMvtForm({produitId:"",type:"entree",quantite:"",motif:"",date:today()});
    notify(`✅ Mouvement enregistré — Nouveau stock : ${newQty} ${prod.unite}`);
  };

  const delProd=id=>{saveS(stocks.filter(s=>s.id!==id));notify("Supprimé",T.red);};

  // Valeur totale du stock
  const valeurStock=stocks.reduce((s,p)=>s+Number(p.quantite||0)*Number(p.prixAchat||0),0);
  const stocksAlerte=stocks.filter(s=>Number(s.quantite||0)<=Number(s.seuilAlerte||0)&&Number(s.seuilAlerte||0)>0);
  const filtered=stocks.filter(s=>!search||s.nom?.toLowerCase().includes(search.toLowerCase())||s.categorie?.toLowerCase().includes(search.toLowerCase()));
  const paginated=filtered.slice(page*PP,(page+1)*PP);

  return(
    <div style={{flex:1,overflowY:"auto",padding:17}}>
      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginBottom:11}}>
        <KPI icon="📦" label="Produits"      value={stocks.length}              color={T.blue}/>
        <KPI icon="💰" label="Valeur stock"  value={`${fmtM(valeurStock)}F`}   color={T.green} sub="Au prix d'achat"/>
        <KPI icon="🚨" label="Alertes"       value={stocksAlerte.length}        color={stocksAlerte.length>0?T.red:T.green} sub="Seuil critique"/>
      </div>

      {/* Nav */}
      <div style={{display:"flex",gap:6,marginBottom:11,alignItems:"center"}}>
        {[["liste","📦 Stock"],["mouvements","↕️ Mouvements"],["form",editId?"✏️ Modifier":"➕ Nouveau"]].map(([v,l])=>(
          <button key={v} onClick={()=>{setView(v);if(v==="liste"){setEditId(null);setForm({nom:"",categorie:"",quantite:"",unite:"unité",prixAchat:"",prixVente:"",seuilAlerte:"",fournisseur:""});setErrors({});}}} style={{background:view===v?T.accent:T.light,border:"none",borderRadius:6,padding:"5px 13px",color:view===v?"#000":T.muted,fontSize:14,cursor:"pointer",fontWeight:view===v?700:400,fontFamily:"inherit"}}>{l}</button>
        ))}
      </div>

      {/* Alertes */}
      {stocksAlerte.length>0&&view==="liste"&&(
        <Card style={{marginBottom:10,padding:14,border:`1px solid ${T.red}33`}}>
          <div style={{fontSize:14,fontWeight:700,color:T.red,marginBottom:6}}>🚨 Stock critique ({stocksAlerte.length} produit{stocksAlerte.length>1?"s":""})</div>
          {stocksAlerte.map(s=>(
            <div key={s.id} style={{display:"flex",justifyContent:"space-between",fontSize:15,padding:"4px 0",borderBottom:`1px solid ${T.border}`}}>
              <span style={{color:T.text}}>{s.nom}</span>
              <span style={{color:T.red,fontWeight:700}}>{s.quantite} {s.unite} (seuil: {s.seuilAlerte})</span>
            </div>
          ))}
        </Card>
      )}

      {/* LISTE */}
      {view==="liste"&&(
        <>
          <input value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} placeholder="🔍 Rechercher..."
            style={{width:"100%",background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 14px",color:T.text,fontSize:16,outline:"none",fontFamily:"inherit",marginBottom:9,boxSizing:"border-box"}}/>
          {paginated.length===0?(
            <div style={{textAlign:"center",padding:"28px 0",color:T.muted}}><div style={{fontSize:32,marginBottom:8}}>📦</div><div style={{fontSize:16}}>{search?"Aucun résultat":"Aucun produit en stock — ajoutez-en !"}</div></div>
          ):paginated.map(p=>{
            const alerte=Number(p.quantite||0)<=Number(p.seuilAlerte||0)&&Number(p.seuilAlerte||0)>0;
            return(
              <Card key={p.id} style={{marginBottom:8,padding:16,border:`1px solid ${alerte?T.red+"44":T.border}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                      <span style={{fontWeight:700,fontSize:17}}>{p.nom}</span>
                      {alerte&&<Badge label="⚠ Stock bas" color={T.red}/>}
                      {p.categorie&&<Badge label={p.categorie} color={T.blue}/>}
                    </div>
                    <div style={{fontSize:15,color:T.muted}}>{p.fournisseur&&`Fourn: ${p.fournisseur} · `}Seuil: {p.seuilAlerte||"—"} {p.unite}</div>
                    {p.prixVente&&<div style={{fontSize:15,color:T.green,marginTop:2}}>Vente: {fmtN(p.prixVente)} FCFA/{p.unite}</div>}
                  </div>
                  <div style={{textAlign:"right",marginLeft:8}}>
                    <div style={{fontSize:22,fontWeight:900,color:alerte?T.red:T.text}}>{fmtN(p.quantite)}</div>
                    <div style={{fontSize:14,color:T.muted}}>{p.unite}</div>
                    <div style={{fontSize:14,color:T.accent,marginTop:2}}>{fmtM(Number(p.quantite||0)*Number(p.prixAchat||0))} F</div>
                  </div>
                </div>
                <div style={{display:"flex",gap:6,marginTop:8}}>
                  <button onClick={()=>{setEditId(p.id);setForm({nom:p.nom,categorie:p.categorie||"",quantite:p.quantite||"",unite:p.unite||"unité",prixAchat:p.prixAchat||"",prixVente:p.prixVente||"",seuilAlerte:p.seuilAlerte||"",fournisseur:p.fournisseur||""});setView("form");}} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:6,padding:"4px 12px",color:T.blue,cursor:"pointer",fontSize:15,fontFamily:"inherit"}}>✏️ Modifier</button>
                  <button onClick={()=>{setMvtForm({...mvtForm,produitId:p.id});setView("mouvements");}} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:6,padding:"4px 12px",color:T.green,cursor:"pointer",fontSize:15,fontFamily:"inherit"}}>↕️ Mouvement</button>
                  <button onClick={()=>delProd(p.id)} style={{background:"none",border:"none",color:T.red,cursor:"pointer",fontSize:17,marginLeft:"auto"}}>🗑</button>
                </div>
              </Card>
            );
          })}
          <Pager total={filtered.length} page={page} pp={PP} onPage={setPage}/>
        </>
      )}

      {/* MOUVEMENTS */}
      {view==="mouvements"&&(
        <>
          <Card style={{marginBottom:11,padding:17}}>
            <div style={{fontWeight:700,marginBottom:10,fontSize:17}}>Enregistrer un mouvement</div>
            <Sel label="Produit" value={mvtForm.produitId} onChange={v=>{setMvtForm({...mvtForm,produitId:v});setMvtErr(p=>({...p,produit:""}));}} required options={[{value:"",label:"-- Sélectionner --"},...stocks.map(s=>({value:s.id,label:`${s.nom} (${s.quantite} ${s.unite})`}))]}/>
            {mvtErr.produit&&<div style={{fontSize:14,color:T.red,marginTop:-7,marginBottom:7}}>⚠ {mvtErr.produit}</div>}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <Sel label="Type" value={mvtForm.type} onChange={v=>setMvtForm({...mvtForm,type:v})} options={[{value:"entree",label:"📥 Entrée (achat/retour)"},{value:"sortie",label:"📤 Sortie (vente/usage)"}]}/>
              <Inp label="Quantité" value={mvtForm.quantite} onChange={v=>{setMvtForm({...mvtForm,quantite:v});setMvtErr(p=>({...p,quantite:""}));}} placeholder="0" required error={mvtErr.quantite}/>
            </div>
            <Inp label="Motif" value={mvtForm.motif} onChange={v=>setMvtForm({...mvtForm,motif:v})} placeholder="Ex: Vente client, Achat fournisseur..."/>
            <Inp label="Date" value={mvtForm.date} onChange={v=>setMvtForm({...mvtForm,date:v})} placeholder={today()}/>
            <Btn onClick={addMvt} full style={{padding:14}}>✓ Enregistrer le mouvement</Btn>
          </Card>
          <div style={{fontSize:15,fontWeight:700,marginBottom:8}}>Historique des mouvements</div>
          {mouvts.slice(0,20).map(m=>(
            <Card key={m.id} style={{marginBottom:7,padding:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:16}}>{m.produitNom}</div>
                  <div style={{fontSize:14,color:T.muted}}>{m.date} · {m.motif||"—"}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:17,fontWeight:800,color:m.type==="entree"?T.green:T.red}}>
                    {m.type==="entree"?"+":"-"}{m.quantite}
                  </div>
                  <div style={{fontSize:13,color:T.muted}}>{m.ancienStock}→{m.nouveauStock}</div>
                </div>
              </div>
            </Card>
          ))}
          {mouvts.length===0&&<div style={{textAlign:"center",padding:"20px 0",color:T.muted,fontSize:16}}>Aucun mouvement enregistré</div>}
        </>
      )}

      {/* FORM */}
      {view==="form"&&(
        <Card style={{padding:14}}>
          <div style={{fontWeight:700,marginBottom:12,fontSize:17}}>{editId?"Modifier":"Nouveau"} produit</div>
          <Inp label="Nom du produit" value={form.nom} onChange={v=>{setForm({...form,nom:v});setErrors(p=>({...p,nom:""}));}} placeholder="Ex: Rame de papier A4" required error={errors.nom}/>
          <Inp label="Catégorie" value={form.categorie} onChange={v=>setForm({...form,categorie:v})} placeholder="Ex: Fournitures, Matériel..."/>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:8}}>
            <Inp label="Quantité initiale" value={form.quantite} onChange={v=>{setForm({...form,quantite:v});setErrors(p=>({...p,quantite:""}));}} placeholder="0" required error={errors.quantite}/>
            <Sel label="Unité" value={form.unite} onChange={v=>setForm({...form,unite:v})} options={["unité","kg","litre","mètre","carton","pièce","heure"]}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <Inp label="Prix d'achat (FCFA)" value={form.prixAchat} onChange={v=>{setForm({...form,prixAchat:v});setErrors(p=>({...p,prixAchat:""}));}} placeholder="0" error={errors.prixAchat}/>
            <Inp label="Prix de vente (FCFA)" value={form.prixVente} onChange={v=>{setForm({...form,prixVente:v});setErrors(p=>({...p,prixVente:""}));}} placeholder="0" error={errors.prixVente}/>
          </div>
          <Inp label="Seuil d'alerte" value={form.seuilAlerte} onChange={v=>setForm({...form,seuilAlerte:v})} placeholder="Ex: 10 — alerte si stock ≤ ce seuil"/>
          <Inp label="Fournisseur" value={form.fournisseur} onChange={v=>setForm({...form,fournisseur:v})} placeholder="Nom du fournisseur"/>
          <div style={{display:"flex",gap:7}}>
            <Btn onClick={addProd} full>Enregistrer</Btn>
            <Btn variant="ghost" onClick={()=>{setView("liste");setEditId(null);setErrors({});}}>Annuler</Btn>
          </div>
        </Card>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// OPTION C.2 — MODULE RH / PAIE
// ══════════════════════════════════════════════════════════════════
function RHTab({orgId,user,notify}){
  const KEY=`akili_employes_${orgId}`;
  const PAIE=`akili_paie_${orgId}`;
  const [employes,  setEmployes] =useState(()=>Store.get(KEY,[]));
  const [fiches,    setFiches]   =useState(()=>Store.get(PAIE,[]));
  const [view,      setView]     =useState("liste"); // liste | form | paie | conges
  const [editId,    setEditId]   =useState(null);
  const [errors,    setErrors]   =useState({});
  const [paieMonth, setPaieMonth]=useState(new Date().toISOString().slice(0,7));
  const [form,setForm]=useState({nom:"",poste:"",typeContrat:"CDI",salaireBrut:"",cnps:"",dateEntree:today(),tel:"",email:"",departement:"",congesRestants:"26"});
  const PP=10; const [page,setPage]=useState(0);

  const saveE=a=>{setEmployes(a);Store.set(KEY,a);};
  const saveF=a=>{setFiches(a);Store.set(PAIE,a);};

  const validate=()=>{
    const e={};
    if(!form.nom.trim()) e.nom="Nom requis";
    if(!form.poste.trim()) e.poste="Poste requis";
    if(!form.salaireBrut||isNaN(Number(form.salaireBrut))||Number(form.salaireBrut)<0) e.salaireBrut="Salaire valide requis";
    setErrors(e); return!Object.keys(e).length;
  };

  const addEmp=()=>{
    if(!validate()) return;
    if(editId){ saveE(employes.map(e=>e.id===editId?{...form,id:editId}:e)); notify("✅ Employé modifié"); }
    else{ saveE([{...form,id:newId("EMP"),createdAt:today()},...employes]); notify("✅ Employé ajouté"); }
    setForm({nom:"",poste:"",typeContrat:"CDI",salaireBrut:"",cnps:"",dateEntree:today(),tel:"",email:"",departement:"",congesRestants:"26"});
    setErrors({}); setEditId(null); setView("liste");
  };

  // Calcul paie OHADA/Côte d'Ivoire
  const calculerPaie=(emp)=>{
    const brut=Number(emp.salaireBrut||0);
    // CNPS salarié : 6.3% (vieillesse 3.2% + AT 0.75% + PF 2.4%)
    const cnpsSalarie=Math.round(brut*0.063);
    // CNPS patronal : 14.175%
    const cnpsPatronal=Math.round(brut*0.14175);
    // ITS (Impôt sur Traitement et Salaire) — simplifié
    const baseITS=brut-cnpsSalarie;
    const its=baseITS>500000?Math.round((baseITS-500000)*0.25+60000):baseITS>250000?Math.round((baseITS-250000)*0.2+10000):baseITS>100000?Math.round((baseITS-100000)*0.1):0;
    const net=brut-cnpsSalarie-its;
    const coutTotal=brut+cnpsPatronal;
    return{brut,cnpsSalarie,cnpsPatronal,its,net,coutTotal};
  };

  const genererFichePaie=(emp)=>{
    const paie=calculerPaie(emp);
    const fiche={id:newId("FP"),employeId:emp.id,employeNom:emp.nom,poste:emp.poste,mois:paieMonth,...paie,date:today()};
    const remplacee=fiches.find(f=>f.employeId===emp.id&&f.mois===paieMonth);
    if(remplacee) retirerEcritures(orgId,remplacee.id);
    saveF([fiche,...fiches.filter(f=>!(f.employeId===emp.id&&f.mois===paieMonth))]);
    // La paie passe seule en comptabilité : 661 et 664 au débit,
    // net à payer, CNPS et ITS au crédit.
    posterEcritures(orgId,fiche.id,ecrituresPaie({
      date:fiche.date, libelle:`Paie ${emp.nom} — ${paieMonth}`, piece:fiche.id,
      brut:paie.brut, cnpsSalarie:paie.cnpsSalarie, cnpsPatronal:paie.cnpsPatronal,
      its:paie.its, net:paie.net,
    }));
    notify(`✅ Fiche de paie générée — ${emp.nom} — Net: ${fmtN(paie.net)} FCFA · écritures OHADA créées`);
  };

  const genererTous=()=>{
    employes.forEach(e=>genererFichePaie(e));
    notify(`✅ ${employes.length} fiches de paie générées !`);
  };

  const masseSalariale=employes.reduce((s,e)=>s+Number(e.salaireBrut||0),0);
  const coutTotal=employes.reduce((s,e)=>s+calculerPaie(e).coutTotal,0);
  const moisFiches=fiches.filter(f=>f.mois===paieMonth);

  const delEmp=id=>{saveE(employes.filter(e=>e.id!==id));notify("Supprimé",T.red);};
  const paginated=employes.slice(page*PP,(page+1)*PP);

  return(
    <div style={{flex:1,overflowY:"auto",padding:17}}>
      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginBottom:11}}>
        <KPI icon="👔" label="Effectif"          value={employes.length}            color={T.blue}/>
        <KPI icon="💸" label="Masse salariale"   value={`${fmtM(masseSalariale)}F`} color={T.accent} sub="Brut/mois"/>
        <KPI icon="🏭" label="Coût total patron" value={`${fmtM(coutTotal)}F`}      color={T.red}   sub="Avec CNPS patronal"/>
      </div>

      {/* Nav */}
      <div style={{display:"flex",gap:5,marginBottom:11,flexWrap:"wrap"}}>
        {[["liste","👔 Employés"],["form",editId?"✏️ Modifier":"➕ Nouveau"],["paie","💸 Paie"],["conges","🏖 Congés"]].map(([v,l])=>(
          <button key={v} onClick={()=>{setView(v);if(v==="liste"){setEditId(null);setErrors({});}}} style={{background:view===v?T.accent:T.light,border:"none",borderRadius:6,padding:"5px 13px",color:view===v?"#000":T.muted,fontSize:14,cursor:"pointer",fontWeight:view===v?700:400,fontFamily:"inherit"}}>{l}</button>
        ))}
      </div>

      {/* LISTE EMPLOYÉS */}
      {view==="liste"&&(
        <>
          {paginated.length===0?(
            <div style={{textAlign:"center",padding:"28px 0",color:T.muted}}><div style={{fontSize:32,marginBottom:8}}>👔</div><div style={{fontSize:16}}>Aucun employé — ajoutez votre équipe !</div></div>
          ):paginated.map(emp=>{
            const paie=calculerPaie(emp);
            return(
              <Card key={emp.id} style={{marginBottom:8,padding:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:17}}>{emp.nom}</div>
                    <div style={{fontSize:14,color:T.muted}}>{emp.poste} · {emp.typeContrat}{emp.departement&&` · ${emp.departement}`}</div>
                    {emp.tel&&<div style={{fontSize:14,color:T.muted}}>📞 {emp.tel}</div>}
                    <div style={{fontSize:14,color:T.muted}}>Depuis le {emp.dateEntree}</div>
                  </div>
                  <div style={{textAlign:"right",marginLeft:8}}>
                    <div style={{fontSize:18,fontWeight:800,color:T.green}}>{fmtN(paie.net)}F</div>
                    <div style={{fontSize:13,color:T.muted}}>Net · Brut: {fmtN(emp.salaireBrut)}</div>
                    <div style={{fontSize:13,color:T.red,marginTop:2}}>Coût: {fmtN(paie.coutTotal)}F</div>
                  </div>
                </div>
                <div style={{display:"flex",gap:5,marginTop:8}}>
                  <button onClick={()=>{setEditId(emp.id);setForm({nom:emp.nom,poste:emp.poste,typeContrat:emp.typeContrat||"CDI",salaireBrut:emp.salaireBrut||"",cnps:emp.cnps||"",dateEntree:emp.dateEntree||today(),tel:emp.tel||"",email:emp.email||"",departement:emp.departement||"",congesRestants:emp.congesRestants||"26"});setView("form");}} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:6,padding:"4px 12px",color:T.blue,cursor:"pointer",fontSize:14,fontFamily:"inherit"}}>✏️</button>
                  <button onClick={()=>{genererFichePaie(emp);setView("paie");}} style={{background:"none",border:`1px solid ${T.green}44`,borderRadius:6,padding:"4px 12px",color:T.green,cursor:"pointer",fontSize:14,fontFamily:"inherit"}}>💸 Paie</button>
                  <button onClick={()=>delEmp(emp.id)} style={{background:"none",border:"none",color:T.red,cursor:"pointer",fontSize:17,marginLeft:"auto"}}>🗑</button>
                </div>
              </Card>
            );
          })}
          <Pager total={employes.length} page={page} pp={PP} onPage={setPage}/>
        </>
      )}

      {/* FORM EMPLOYÉ */}
      {view==="form"&&(
        <Card style={{padding:14}}>
          <div style={{fontWeight:700,marginBottom:12,fontSize:17}}>{editId?"Modifier":"Nouvel"} employé</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <Inp label="Nom complet" value={form.nom} onChange={v=>{setForm({...form,nom:v});setErrors(p=>({...p,nom:""}));}} placeholder="KOFFI Amani" required error={errors.nom}/>
            <Inp label="Poste" value={form.poste} onChange={v=>{setForm({...form,poste:v});setErrors(p=>({...p,poste:""}));}} placeholder="Développeur web" required error={errors.poste}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <Sel label="Type de contrat" value={form.typeContrat} onChange={v=>setForm({...form,typeContrat:v})} options={["CDI","CDD","Stage","Freelance","Journalier"]}/>
            <Inp label="Département" value={form.departement} onChange={v=>setForm({...form,departement:v})} placeholder="Tech, Marketing..."/>
          </div>
          <Inp label="Salaire brut (FCFA/mois)" value={form.salaireBrut} onChange={v=>{setForm({...form,salaireBrut:v});setErrors(p=>({...p,salaireBrut:""}));}} placeholder="150000" required error={errors.salaireBrut}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <Inp label="Date d'entrée" value={form.dateEntree} onChange={v=>setForm({...form,dateEntree:v})} placeholder={today()}/>
            <Inp label="Congés restants (jours)" value={form.congesRestants} onChange={v=>setForm({...form,congesRestants:v})} placeholder="26"/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <Inp label="Téléphone" value={form.tel} onChange={v=>setForm({...form,tel:v})} placeholder="225XXXXXXXX"/>
            <Inp label="Email" value={form.email} onChange={v=>setForm({...form,email:v})} placeholder="email@exemple.com" type="email"/>
          </div>

          {/* Simulation paie */}
          {form.salaireBrut&&Number(form.salaireBrut)>0&&(()=>{
            const p=calculerPaie({salaireBrut:form.salaireBrut});
            return(
              <div style={{background:T.green+"12",border:`1px solid ${T.green}33`,borderRadius:8,padding:16,marginBottom:10}}>
                <div style={{fontSize:14,fontWeight:700,color:T.green,marginBottom:6}}>📊 Simulation paie (CI)</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,fontSize:14}}>
                  {[["Brut",fmtN(p.brut)+" F",T.text],["CNPS salarié (6.3%)","-"+fmtN(p.cnpsSalarie)+" F",T.red],["ITS","-"+fmtN(p.its)+" F",T.red],["NET à payer",fmtN(p.net)+" F",T.green],["CNPS patronal (14.175%)",""+fmtN(p.cnpsPatronal)+" F",T.orange],["Coût total employeur",fmtN(p.coutTotal)+" F",T.red]].map(([l,v,c])=>(
                    <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",borderBottom:`1px solid ${T.border}`}}>
                      <span style={{color:T.muted}}>{l}</span><span style={{fontWeight:700,color:c}}>{v}</span>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:13,color:T.muted,marginTop:6}}>⚠️ Calcul indicatif. Taux CI 2026 : CNPS salarié 6.3%, CNPS patronal 14.175%, ITS barème progressif.</div>
              </div>
            );
          })()}

          <div style={{display:"flex",gap:7}}><Btn onClick={addEmp} full>Enregistrer</Btn><Btn variant="ghost" onClick={()=>{setView("liste");setEditId(null);setErrors({});}}>Annuler</Btn></div>
        </Card>
      )}

      {/* PAIE */}
      {view==="paie"&&(
        <>
          <Card style={{marginBottom:11,padding:17}}>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <div>
                <div style={{fontSize:14,color:T.muted,marginBottom:3,textTransform:"uppercase",letterSpacing:".5px"}}>Mois de paie</div>
                <input type="month" value={paieMonth} onChange={e=>setPaieMonth(e.target.value)}
                  style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 14px",color:T.text,fontSize:16,outline:"none",fontFamily:"inherit"}}/>
              </div>
              <Btn onClick={genererTous} style={{marginTop:14}} disabled={employes.length===0}>
                💸 Générer {employes.length} fiche{employes.length>1?"s":""}
              </Btn>
            </div>
          </Card>
          <div style={{fontSize:15,fontWeight:700,marginBottom:8}}>
            Fiches de paie — {paieMonth} ({moisFiches.length} générée{moisFiches.length>1?"s":""})
          </div>
          {moisFiches.length===0?(
            <div style={{textAlign:"center",padding:"20px 0",color:T.muted,fontSize:16}}>Aucune fiche pour ce mois — cliquez "Générer"</div>
          ):moisFiches.map(f=>(
            <Card key={f.id} style={{marginBottom:8,padding:17}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div>
                  <div style={{fontWeight:800,fontSize:17}}>{f.employeNom}</div>
                  <div style={{fontSize:14,color:T.muted}}>{f.poste} · {f.mois}</div>
                </div>
                <Badge label="✅ Générée" color={T.green}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,fontSize:14}}>
                {[["Salaire brut",fmtN(f.brut)+" F",T.text],["CNPS salarié","-"+fmtN(f.cnpsSalarie)+" F",T.red],["ITS","-"+fmtN(f.its)+" F",T.red],["SALAIRE NET",fmtN(f.net)+" F",T.green]].map(([l,v,c])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${T.border}`}}>
                    <span style={{color:T.muted}}>{l}</span><span style={{fontWeight:700,color:c}}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{marginTop:8,fontSize:14,color:T.orange}}>Charge patronale CNPS: {fmtN(f.cnpsPatronal)} F · Coût total: {fmtN(f.coutTotal)} F</div>
            </Card>
          ))}
          {moisFiches.length>0&&(
            <Card style={{padding:14,border:`1px solid ${T.accent}33`,marginTop:4}}>
              <div style={{fontSize:15,fontWeight:700,color:T.accent,marginBottom:4}}>📊 Récapitulatif {paieMonth}</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,fontSize:15}}>
                {[["Total nets versés",fmtN(moisFiches.reduce((s,f)=>s+f.net,0))+" F",T.green],
                  ["Total CNPS salarié",fmtN(moisFiches.reduce((s,f)=>s+f.cnpsSalarie,0))+" F",T.red],
                  ["Total ITS (DGI)",fmtN(moisFiches.reduce((s,f)=>s+f.its,0))+" F",T.red],
                  ["Total CNPS patronal",fmtN(moisFiches.reduce((s,f)=>s+f.cnpsPatronal,0))+" F",T.orange],
                  ["Coût total employeur",fmtN(moisFiches.reduce((s,f)=>s+f.coutTotal,0))+" F",T.red],
                ].map(([l,v,c])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${T.border}`}}>
                    <span style={{color:T.muted,fontSize:14}}>{l}</span><span style={{fontWeight:700,color:c}}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{fontSize:13,color:T.muted,marginTop:7}}>⚠️ Fiches indicatives. Faites valider par un expert-comptable agréé avant versement et déclaration CNPS/DGI.</div>
            </Card>
          )}
        </>
      )}

      {/* CONGÉS */}
      {view==="conges"&&(
        <>
          <div style={{fontSize:15,fontWeight:700,marginBottom:8}}>🏖 Suivi des congés</div>
          {employes.length===0?(
            <div style={{textAlign:"center",padding:"20px 0",color:T.muted,fontSize:16}}>Ajoutez des employés pour gérer leurs congés</div>
          ):employes.map(emp=>(
            <Card key={emp.id} style={{marginBottom:8,padding:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:17}}>{emp.nom}</div>
                  <div style={{fontSize:14,color:T.muted}}>{emp.poste}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:22,fontWeight:900,color:Number(emp.congesRestants||26)>10?T.green:T.red}}>{emp.congesRestants||26}</div>
                  <div style={{fontSize:13,color:T.muted}}>jours restants</div>
                  <div style={{background:T.border,borderRadius:10,height:4,marginTop:4,width:80}}>
                    <div style={{height:"100%",width:`${Math.min(100,((Number(emp.congesRestants||26))/26)*100)}%`,background:Number(emp.congesRestants||26)>10?T.green:T.red,borderRadius:10}}/>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}

// ─── DOCS TAB (simplifié) ─────────────────────────────────────────
function DocsTab({orgId,user,plan,notify,onUpgrade}){
  const KEY=`akili_docs_${orgId}`;
  const [docs,setDocs]=useState(()=>Store.get(KEY,[]));
  const [view,setView]=useState("list");
  const [docType,setDocType]=useState("");
  const [form,setForm]=useState({client:"",service:"",montant:"",details:"",devise:"FCFA"});
  const [errors,setErrors]=useState({});
  const [generated,setGen]=useState("");
  const [loading,setLoad]=useState(false);
  const [apiErr,setApiErr]=useState("");
  const [filter,setFilter]=useState("tous");
  const [search,setSearch]=useState("");
  const [page,setPage]=useState(0);
  const PP=10;
  const save=a=>{setDocs(a);Store.set(KEY,a);};
  const validateForm=()=>{const e={};if(!form.client.trim())e.client="Client requis";if(!form.service.trim())e.service="Service requis";if(!form.montant||isNaN(Number(form.montant))||Number(form.montant)<=0)e.montant="Montant valide requis";setErrors(e);return!Object.keys(e).length;};
  const generate=async()=>{
    if(!validateForm()) return;
    if(!QM.can(user.uid,plan)){notify("🚫 Quota IA épuisé",T.red);onUpgrade();return;}
    setLoad(true);setGen("");setApiErr("");QM.inc(user.uid);
    const num=newId(docType.toUpperCase().slice(0,3));
    const prompt=`Génère un ${docType} professionnel N°${num} daté du ${today()} :\nClient: ${form.client} | Service: ${form.service} | Montant: ${fmtN(form.montant)} ${form.devise}\nPrestataire: ${user.entreprise||"Mon entreprise"}\nConditions: 50% signature, 50% livraison${form.details?" | "+form.details:""}\nNote bas de page: "Document généré par AKILI ERP — ${EDITEUR.nom} (RCCM ${EDITEUR.rccm}) à titre indicatif — à valider par un professionnel qualifié."`;
    try{
      const d=await appelIA({system:SYSTEM,messages:[{role:"user",content:prompt}]});
      const txt=d.texte;
      const doc={id:num,type:docType,client:form.client,montant:form.montant,devise:form.devise,date:today(),content:txt,owner:user.uid};
      setGen(txt);save([doc,...docs]);
      // Seule une facture engendre une vente : un devis n'est pas une
      // créance tant qu'il n'est pas accepté, et le comptabiliser
      // gonflerait artificiellement le chiffre d'affaires.
      if(docType==="facture" && Number(doc.montant)>0){
        const conv=versFCFA(doc.montant,doc.devise,orgId);
        if(conv.ok){
          posterEcritures(orgId,doc.id,ecrituresVente({
            date:doc.date,
            libelle:`Facture ${doc.client||"client"}${conv.note?` — ${conv.note}`:""}`,
            piece:doc.id, montantHT:conv.montant, tauxTVA:18, compteProduit:"706",
          }));
          notify("📒 Facture comptabilisée (411 / 706 / 443)");
        }else{
          notify("⚠️ Non comptabilisée : "+conv.raison,T.accent);
        }
      }
      notify("✅ Document généré et sauvegardé !");
    }catch(e){setApiErr(e.message||"Erreur de génération.");}
    setLoad(false);
  };
  const del=id=>{save(docs.filter(d=>d.id!==id));notify("Supprimé",T.red);};
  const typeColor=t=>({devis:T.accent,facture:T.green,contrat:T.blue,proposition:T.purple}[t]||T.muted);
  const filtered=docs.filter(d=>(filter==="tous"||d.type===filter)&&(!search||d.client?.toLowerCase().includes(search.toLowerCase())));
  const paginated=filtered.slice(page*PP,(page+1)*PP);

  if(view==="new"&&!docType) return(
    <div style={{flex:1,overflowY:"auto",padding:17}}>
      <div style={{display:"flex",gap:7,marginBottom:14,alignItems:"center"}}><Btn variant="ghost" onClick={()=>setView("list")}>← Retour</Btn><span style={{fontWeight:800,fontSize:18}}>Nouveau document</span></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {[["devis","📋","Devis",T.accent],["facture","🧾","Facture",T.green],["contrat","📝","Contrat",T.blue],["proposition","💼","Proposition",T.purple]].map(([id,ic,lb,col])=>(
          <button key={id} onClick={()=>{setDocType(id);setForm({client:"",service:"",montant:"",details:"",devise:"FCFA"});setErrors({});setApiErr("");}} style={{background:T.card,border:`1px solid ${col}33`,borderRadius:12,padding:18,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:7}}>
            <span style={{fontSize:30}}>{ic}</span><span style={{color:T.text,fontSize:17,fontWeight:700,fontFamily:"inherit"}}>{lb}</span>
          </button>
        ))}
      </div>
    </div>
  );
  if(view==="new"&&docType&&!generated) return(
    <div style={{flex:1,overflowY:"auto",padding:17}}>
      <div style={{display:"flex",gap:7,marginBottom:13,alignItems:"center"}}><Btn variant="ghost" onClick={()=>{setDocType("");setErrors({});}}>←</Btn><span style={{fontWeight:800,fontSize:18}}>Nouveau {docType}</span><span style={{marginLeft:"auto",fontSize:14,color:T.muted}}>⚡{QM.left(user.uid,plan)===999?"∞":QM.left(user.uid,plan)} restants</span></div>
      <Inp label="Client" value={form.client} onChange={v=>{setForm({...form,client:v});setErrors(p=>({...p,client:""}));}} placeholder="Zeleck / Mairie" required error={errors.client}/>
      <Inp label="Service" value={form.service} onChange={v=>{setForm({...form,service:v});setErrors(p=>({...p,service:""}));}} placeholder="Développement site web" required error={errors.service}/>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:8}}>
        <Inp label="Montant" value={form.montant} onChange={v=>{setForm({...form,montant:v});setErrors(p=>({...p,montant:""}));}} placeholder="6000000" required error={errors.montant}/>
        <Sel label="Devise" value={form.devise} onChange={v=>setForm({...form,devise:v})} options={["FCFA","EUR","USD","XOF"]}/>
      </div>
      <Inp label="Détails (optionnel)" value={form.details} onChange={v=>setForm({...form,details:v})} placeholder="Délai, conditions..."/>
      {apiErr&&<div style={{padding:"9px 13px",background:T.red+"15",border:`1px solid ${T.red}33`,borderRadius:7,color:T.red,fontSize:15,marginBottom:10}}>⚠ {apiErr}</div>}
      <Btn onClick={generate} disabled={loading} full style={{padding:16}}>{ loading?"⏳ Génération...":"✨ Générer le "+docType}</Btn>
    </div>
  );
  if(view==="new"&&generated) return(
    <div style={{flex:1,overflowY:"auto",padding:17}}>
      <div style={{display:"flex",gap:7,marginBottom:12,flexWrap:"wrap"}}>
        <Btn variant="ghost" onClick={()=>{setGen("");setDocType("");setView("list");setPage(0);}}>← Liste</Btn>
        <Badge label="✅ Sauvegardé" color={T.green}/>
        <Btn variant="green" sm onClick={()=>{const t=`📄 *${docType.toUpperCase()} N°${docs[0]?.id}*\n👤 ${form.client}\n💰 ${fmtN(form.montant)} ${form.devise}`;window.open(`https://wa.me/?text=${encodeURIComponent(t)}`,"_blank");}} style={{marginLeft:"auto"}}>📲 WhatsApp</Btn>
      </div>
      <Card style={{fontSize:16,lineHeight:1.8,whiteSpace:"pre-wrap"}}>{generated}</Card>
    </div>
  );
  return(
    <div style={{flex:1,overflowY:"auto",padding:17}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <span style={{fontWeight:800,fontSize:18}}>📄 Documents ({docs.length})</span>
        <Btn sm onClick={()=>{setView("new");setDocType("");setGen("");}}>+ Nouveau</Btn>
      </div>
      <input value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} placeholder="🔍 Rechercher..." style={{width:"100%",background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 14px",color:T.text,fontSize:16,outline:"none",fontFamily:"inherit",marginBottom:8,boxSizing:"border-box"}}/>
      <div style={{display:"flex",gap:5,marginBottom:9,overflowX:"auto"}}>
        {["tous","devis","facture","contrat","proposition"].map(f=>(<button key={f} onClick={()=>{setFilter(f);setPage(0);}} style={{background:filter===f?T.accent:T.light,border:"none",borderRadius:16,padding:"4px 13px",color:filter===f?"#000":T.muted,fontSize:14,cursor:"pointer",fontWeight:filter===f?700:400,whiteSpace:"nowrap",fontFamily:"inherit"}}>{f.charAt(0).toUpperCase()+f.slice(1)}</button>))}
      </div>
      {paginated.length===0?(<div style={{textAlign:"center",padding:"28px 0",color:T.muted}}><div style={{fontSize:32,marginBottom:8}}>📄</div><div style={{fontSize:16}}>{search||filter!=="tous"?"Aucun résultat":"Créez votre premier document !"}</div></div>)
      :paginated.map(d=>(<Card key={d.id} style={{marginBottom:7,padding:14}}><div style={{display:"flex",alignItems:"center",gap:7}}><div style={{flex:1}}><div style={{display:"flex",gap:5,alignItems:"center",marginBottom:2}}><Badge label={d.type?.toUpperCase()||"DOC"} color={typeColor(d.type)}/><span style={{fontSize:13,color:T.muted}}>{d.id}</span></div><div style={{fontWeight:700,fontSize:16}}>{d.client}</div><div style={{fontSize:14,color:T.muted}}>{fmtN(d.montant)} {d.devise||"FCFA"} · {d.date}</div></div><button onClick={()=>window.open(`https://wa.me/?text=${encodeURIComponent(`📄 ${d.type?.toUpperCase()} N°${d.id}\n👤 ${d.client}\n💰 ${fmtN(d.montant)} ${d.devise||"FCFA"}`)}`, "_blank")} style={{background:"none",border:"none",fontSize:19,cursor:"pointer"}}>📲</button><button onClick={()=>del(d.id)} style={{background:"none",border:"none",color:T.red,cursor:"pointer",fontSize:17}}>🗑</button></div></Card>))}
      <Pager total={filtered.length} page={page} pp={PP} onPage={setPage}/>
    </div>
  );
}

// ─── CLIENTS TAB (compact) ────────────────────────────────────────
function ClientsTab({orgId,user,notify}){
  const KEY=`akili_clients_${orgId}`;
  const [clients,setClients]=useState(()=>Store.get(KEY,[]));
  const [showForm,setShow]=useState(false);
  const [search,setSearch]=useState("");
  const [page,setPage]=useState(0);
  const PP=10;
  const [form,setForm]=useState({nom:"",secteur:"",statut:"Prospect",ca:"",tel:"",email:"",note:""});
  const [errors,setErrors]=useState({});
  const [editId,setEditId]=useState(null);
  const save=a=>{setClients(a);Store.set(KEY,a);};
  const validate=()=>{const e={};if(!form.nom.trim())e.nom="Nom requis";if(form.email&&!/\S+@\S+\.\S+/.test(form.email))e.email="Email invalide";if(form.ca&&(isNaN(Number(form.ca))||Number(form.ca)<0))e.ca="Montant invalide";setErrors(e);return!Object.keys(e).length;};
  const add=()=>{if(!validate())return;if(editId){save(clients.map(c=>c.id===editId?{...form,id:editId}:c));notify("✅ Client modifié");}else{save([{...form,id:newId("C"),createdAt:today()},...clients]);notify("✅ Client ajouté");}setForm({nom:"",secteur:"",statut:"Prospect",ca:"",tel:"",email:"",note:""});setErrors({});setShow(false);setEditId(null);};
  const del=id=>{save(clients.filter(c=>c.id!==id));notify("Supprimé",T.red);};
  const edit=c=>{setForm({nom:c.nom,secteur:c.secteur||"",statut:c.statut,ca:c.ca||"",tel:c.tel||"",email:c.email||"",note:c.note||""});setEditId(c.id);setShow(true);setErrors({});};
  const sc=s=>s==="Actif"?T.green:s==="Prospect"?T.accent:T.muted;
  const totalCA=clients.filter(c=>c.statut==="Actif").reduce((s,c)=>s+Number(c.ca||0),0);
  const filtered=clients.filter(c=>!search||c.nom?.toLowerCase().includes(search.toLowerCase())||c.secteur?.toLowerCase().includes(search.toLowerCase()));
  const paginated=filtered.slice(page*PP,(page+1)*PP);
  return(
    <div style={{flex:1,overflowY:"auto",padding:17}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginBottom:10}}>
        {[[clients.length,"Total","👥",T.blue],[clients.filter(c=>c.statut==="Actif").length,"Actifs","✅",T.green],[`${fmtM(totalCA)}F`,"CA FCFA","💰",T.accent]].map(([v,l,i,c])=>(<Card key={l} style={{padding:12,background:T.card2,textAlign:"center"}}><div style={{fontSize:17}}>{i}</div><div style={{fontSize:17,fontWeight:800,color:c}}>{v}</div><div style={{fontSize:13,color:T.muted}}>{l}</div></Card>))}
      </div>
      <div style={{display:"flex",gap:7,marginBottom:9}}>
        <input value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} placeholder="🔍 Rechercher..." style={{flex:1,background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 13px",color:T.text,fontSize:16,outline:"none",fontFamily:"inherit"}}/>
        <Btn sm onClick={()=>{setShow(!showForm);setEditId(null);setForm({nom:"",secteur:"",statut:"Prospect",ca:"",tel:"",email:"",note:""});setErrors({});}}>{showForm?"Fermer":"+ Client"}</Btn>
      </div>
      {showForm&&(<Card style={{marginBottom:10,padding:16}}><div style={{fontWeight:700,marginBottom:9,fontSize:17}}>{editId?"Modifier":"Nouveau"} client</div><Inp label="Nom" value={form.nom} onChange={v=>{setForm({...form,nom:v});setErrors(p=>({...p,nom:""}));}} placeholder="Zeleck" required error={errors.nom}/><Inp label="Secteur" value={form.secteur} onChange={v=>setForm({...form,secteur:v})} placeholder="BTP, Commerce..."/><Inp label="WhatsApp" value={form.tel} onChange={v=>setForm({...form,tel:v})} placeholder="225XXXXXXXX"/><Inp label="CA estimé (FCFA)" value={form.ca} onChange={v=>{setForm({...form,ca:v});setErrors(p=>({...p,ca:""}));}} placeholder="6000000" error={errors.ca}/><Inp label="Note" value={form.note} onChange={v=>setForm({...form,note:v})} placeholder="Notes..."/><Sel label="Statut" value={form.statut} onChange={v=>setForm({...form,statut:v})} options={["Prospect","Actif","Inactif"]}/><div style={{display:"flex",gap:7}}><Btn onClick={add} full>Enregistrer</Btn><Btn variant="ghost" onClick={()=>{setShow(false);setEditId(null);setErrors({});}}>Annuler</Btn></div></Card>)}
      {paginated.map(c=>(<Card key={c.id} style={{marginBottom:7,padding:14}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><div style={{flex:1}}><div style={{fontWeight:700,fontSize:17}}>{c.nom}</div><div style={{fontSize:14,color:T.muted}}>{c.secteur}{c.tel&&` · 📞 ${c.tel}`}</div>{c.note&&<div style={{fontSize:14,color:T.muted,fontStyle:"italic"}}>{c.note}</div>}{c.ca&&<div style={{fontSize:15,fontWeight:700,color:T.accent,marginTop:2}}>{fmtN(c.ca)} F</div>}</div><div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:5}}><Badge label={c.statut} color={sc(c.statut)}/><div style={{display:"flex",gap:4}}>{c.tel&&<button onClick={()=>window.open(`https://wa.me/${c.tel.replace(/\D/g,"")}`, "_blank")} style={{background:"none",border:"none",fontSize:17,cursor:"pointer"}}>📲</button>}<button onClick={()=>edit(c)} style={{background:"none",border:"none",color:T.blue,cursor:"pointer",fontSize:16}}>✏️</button><button onClick={()=>del(c.id)} style={{background:"none",border:"none",color:T.red,cursor:"pointer",fontSize:16}}>🗑</button></div></div></div></Card>))}
      {paginated.length===0&&!showForm&&<div style={{textAlign:"center",padding:"24px 0",color:T.muted}}><div style={{fontSize:32,marginBottom:8}}>👥</div><div style={{fontSize:16}}>{search?"Aucun résultat":"Aucun client"}</div></div>}
      <Pager total={filtered.length} page={page} pp={PP} onPage={setPage}/>
    </div>
  );
}

// ─── COMPTA TAB (compact) ─────────────────────────────────────────
// ─── COMPTABILITÉ OHADA ───────────────────────────────────────────
// Sept lectures d'un même journal. Rien n'est reporté à la main :
// changez une écriture, le grand livre, la balance, le résultat et le
// bilan suivent dans la seconde.
function ComptaTab({orgId,user,notify}){
  const KEY=`akili_ecrit_${orgId}`;
  const [view,setView]=useState("journal");
  const [ecritures,setEcritures]=useState(()=>Store.get(KEY,[]));
  const [page,setPage]=useState(0); const PP=15;
  const [cpt,setCpt]=useState("");       // compte ouvert dans le grand livre
  const [errors,setErrors]=useState({});
  const vide={date:today(),libelle:"",compte:"521",debit:"",credit:"",piece:"",journal:"OD"};
  const [form,setForm]=useState(vide);
  const [taux,setTaux]=useState(()=>String(tauxUSD(orgId)||""));

  const save=l=>{setEcritures(l);Store.set(KEY,l);};

  const gl      = Compta.grandLivre(ecritures);
  const bal     = Compta.balance(ecritures);
  const res     = Compta.resultat(ecritures);
  const bil     = Compta.bilan(ecritures);
  const ctrl    = Compta.controles(ecritures);
  const auto    = ecritures.filter(e=>e.src).length;

  const ajouter=()=>{
    const e={};
    if(!form.libelle.trim()) e.libelle="Libellé requis";
    const d=Number(form.debit||0), c=Number(form.credit||0);
    if(!d&&!c) e.debit="Saisissez un débit ou un crédit";
    if(d&&c)   e.debit="Une ligne porte un débit OU un crédit, pas les deux";
    if(!form.piece.trim()) e.piece="N° de pièce requis (obligatoire en OHADA)";
    setErrors(e); if(Object.keys(e).length) return;
    save([{...form,id:uuid(),debit:d,credit:c},...ecritures]);
    setForm({...vide,date:form.date}); setErrors({});
    notify("✅ Écriture enregistrée");
  };

  const supprimer=(e)=>{
    if(e.src){ notify("⚠️ Écriture automatique — modifiez la pièce d'origine",T.accent); return; }
    save(ecritures.filter(x=>x.id!==e.id)); notify("🗑 Supprimé",T.red);
  };

  const exporterCSV=()=>{
    const esc=v=>`"${String(v==null?"":v).replace(/"/g,'""')}"`;
    const L=[["Date","Piece","Compte","Intitule","Libelle","Debit","Credit"].join(";")];
    [...ecritures].reverse().forEach(e=>L.push(
      [e.date,e.piece||"",e.compte||"",libelleCompte(e.compte),e.libelle||"",Number(e.debit||0),Number(e.credit||0)].map(esc).join(";")));
    L.push(["","","","","TOTAUX",bal.totaux.mvtDebit,bal.totaux.mvtCredit].map(esc).join(";"));
    const blob=new Blob(["﻿"+L.join("\r\n")],{type:"text/csv;charset=utf-8;"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a");
    a.href=url; a.download=`OHADA_${(user.entreprise||"AKILI").replace(/\W+/g,"_")}_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    notify("📤 Journal exporté");
  };

  const Ligne=({g,d,c,fort,accent})=>(
    <div style={{display:"flex",justifyContent:"space-between",gap:9,padding:"7px 0",
                 borderBottom:`1px solid ${T.border}`,fontSize:15,
                 fontWeight:fort?700:400,color:accent||T.text}}>
      <span style={{flex:1,minWidth:0}}>{g}</span>
      {d!==undefined && <span style={{minWidth:92,textAlign:"right"}}>{d?fmtN(d):"—"}</span>}
      {c!==undefined && <span style={{minWidth:92,textAlign:"right"}}>{c?fmtN(c):"—"}</span>}
    </div>
  );

  const vues=[["journal","📔 Journal"],["gl","📚 Grand livre"],["balance","⚖️ Balance"],
              ["resultat","📊 Résultat"],["bilan","🏛 Bilan"],["ctrl","🔍 Contrôles"],["export","📤 Export"]];
  const paginated=ecritures.slice(page*PP,(page+1)*PP);

  return(
    <div style={{flex:1,overflowY:"auto",padding:12}}>
      <div style={{display:"flex",gap:6,marginBottom:12,overflowX:"auto",
                   maskImage:"linear-gradient(90deg,#000 0,#000 calc(100% - 18px),transparent 100%)",
                   WebkitMaskImage:"linear-gradient(90deg,#000 0,#000 calc(100% - 18px),transparent 100%)"}}>
        {vues.map(([v,l])=>(
          <Btn key={v} sm variant={view===v?"primary":"ghost"} onClick={()=>{setView(v);setCpt("");}}>{l}</Btn>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:12}}>
        <KPI icon="📔" label="Écritures" value={ecritures.length} sub={`${auto} automatique${auto>1?"s":""}`} color={T.accent}/>
        <KPI icon="⚖️" label="Équilibre" value={bal.equilibree?"OK":fmtM(Math.abs(bal.totaux.mvtDebit-bal.totaux.mvtCredit))+"F"}
             sub={bal.equilibree?"Débit = crédit":"À corriger"} color={bal.equilibree?T.green:T.red}/>
        <KPI icon="📊" label="Résultat" value={fmtM(res.resultat)+"F"} sub={res.resultat>=0?"Bénéfice":"Perte"} color={res.resultat>=0?T.green:T.red}/>
        <KPI icon="🏛" label="Total bilan" value={fmtM(bil.totalActif)+"F"}
             sub={bil.equilibre?"Équilibré":"Écart "+fmtM(Math.abs(bil.ecart))+"F"} color={bil.equilibre?T.green:T.red}/>
      </div>

      {/* ── JOURNAL ── */}
      {view==="journal" && <>
        <Card style={{marginBottom:12}}>
          <div style={{fontSize:16,fontWeight:700,color:T.text,marginBottom:10}}>Écriture manuelle</div>
          <div style={{fontSize:14,color:T.muted,marginBottom:10,lineHeight:1.6}}>
            Les ventes, achats et bulletins de paie créent leurs écritures tout seuls.
            Ce formulaire sert aux opérations qui n'ont pas de pièce dans l'application :
            apport en capital, frais bancaires, virement entre caisse et banque.
          </div>
          <Inp label="Date" value={form.date} onChange={v=>setForm({...form,date:v})} placeholder="JJ/MM/AAAA"/>
          <Inp label="Libellé" required value={form.libelle} onChange={v=>setForm({...form,libelle:v})} placeholder="Apport en capital" error={errors.libelle}/>
          <Sel label="Compte" required value={form.compte} onChange={v=>setForm({...form,compte:v})}
               options={Object.keys(PLAN_OHADA).map(c=>({value:c,label:`${c} — ${PLAN_OHADA[c]}`}))}/>
          <div style={{display:"flex",gap:9}}>
            <div style={{flex:1}}><Inp label="Débit" value={form.debit} onChange={v=>setForm({...form,debit:v,credit:v?"":form.credit})} placeholder="0" error={errors.debit}/></div>
            <div style={{flex:1}}><Inp label="Crédit" value={form.credit} onChange={v=>setForm({...form,credit:v,debit:v?"":form.debit})} placeholder="0"/></div>
          </div>
          <Inp label="N° de pièce" required value={form.piece} onChange={v=>setForm({...form,piece:v})} placeholder="PC-2026-001" error={errors.piece}/>
          <Btn full onClick={ajouter}>✓ Enregistrer</Btn>
        </Card>

        {!ecritures.length
          ? <Card style={{textAlign:"center",padding:26,color:T.muted,fontSize:15}}>
              Aucune écriture.<br/>Enregistrez une vente ou un achat : la comptabilité se remplira d'elle-même.
            </Card>
          : paginated.map(e=>(
            <Card key={e.id} style={{marginBottom:6,padding:13}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:9}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:16,color:T.text}}>{e.libelle}</div>
                  <div style={{fontSize:13,color:T.muted,marginTop:2}}>
                    {e.date} · {e.compte} {libelleCompte(e.compte)}{e.piece?` · ${e.piece}`:""}
                    {e.src && <span style={{color:T.accent}}> · auto</span>}
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  {!!Number(e.debit) && <div style={{fontSize:15,fontWeight:700,color:T.text}}>D {fmtN(e.debit)}</div>}
                  {!!Number(e.credit)&& <div style={{fontSize:15,fontWeight:700,color:T.muted}}>C {fmtN(e.credit)}</div>}
                </div>
                <button onClick={()=>supprimer(e)} style={{background:"none",border:"none",color:e.src?T.border:T.red,cursor:"pointer",fontSize:16}}>🗑</button>
              </div>
            </Card>))}
        <Pager total={ecritures.length} page={page} pp={PP} onPage={setPage}/>
      </>}

      {/* ── GRAND LIVRE ── */}
      {view==="gl" && <>
        {!cpt
          ? (!gl.length
              ? <Card style={{textAlign:"center",padding:26,color:T.muted,fontSize:15}}>Aucun compte mouvementé.</Card>
              : gl.map(g=>(
                <Card key={g.compte} style={{marginBottom:6,padding:13,cursor:"pointer"}} onClick={()=>setCpt(g.compte)}>
                  <div style={{display:"flex",justifyContent:"space-between",gap:9,alignItems:"center"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:16,fontWeight:700,color:T.text}}>{g.compte} — {g.libelle}</div>
                      <div style={{fontSize:13,color:T.muted,marginTop:2}}>{g.lignes.length} mouvement(s)</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:16,fontWeight:800,color:g.solde>=0?T.text:T.muted}}>
                        {fmtN(Math.abs(g.solde))} F
                      </div>
                      <div style={{fontSize:13,color:T.muted}}>{g.solde>=0?"débiteur":"créditeur"}</div>
                    </div>
                  </div>
                </Card>)))
          : (()=>{
              const g=gl.find(x=>x.compte===cpt);
              if(!g) return null;
              return(
                <Card>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <div style={{fontSize:17,fontWeight:700,color:T.text}}>{g.compte} — {g.libelle}</div>
                    <Btn sm variant="ghost" onClick={()=>setCpt("")}>← Comptes</Btn>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",gap:9,fontSize:13,color:T.muted,
                               paddingBottom:5,borderBottom:`1px solid ${T.border}`,fontWeight:700}}>
                    <span style={{flex:1}}>Date · Libellé</span>
                    <span style={{minWidth:80,textAlign:"right"}}>Débit</span>
                    <span style={{minWidth:80,textAlign:"right"}}>Crédit</span>
                    <span style={{minWidth:88,textAlign:"right"}}>Solde</span>
                  </div>
                  {g.lignes.map((l,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",gap:9,padding:"8px 0",
                                         borderBottom:`1px solid ${T.border}`,fontSize:14}}>
                      <span style={{flex:1,minWidth:0,color:T.text}}>
                        <span style={{color:T.muted}}>{l.date}</span> {l.libelle}
                      </span>
                      <span style={{minWidth:80,textAlign:"right",color:T.text}}>{l.debit?fmtN(l.debit):"—"}</span>
                      <span style={{minWidth:80,textAlign:"right",color:T.muted}}>{l.credit?fmtN(l.credit):"—"}</span>
                      <span style={{minWidth:88,textAlign:"right",fontWeight:700,color:l.solde>=0?T.text:T.muted}}>{fmtN(Math.abs(l.solde))}</span>
                    </div>
                  ))}
                  <div style={{display:"flex",justifyContent:"space-between",gap:9,paddingTop:9,fontSize:15,fontWeight:800,color:T.accent}}>
                    <span style={{flex:1}}>Totaux</span>
                    <span style={{minWidth:80,textAlign:"right"}}>{fmtN(g.debit)}</span>
                    <span style={{minWidth:80,textAlign:"right"}}>{fmtN(g.credit)}</span>
                    <span style={{minWidth:88,textAlign:"right"}}>{fmtN(Math.abs(g.solde))} {g.solde>=0?"D":"C"}</span>
                  </div>
                </Card>
              );
            })()}
      </>}

      {/* ── BALANCE ── */}
      {view==="balance" && <Card>
        <div style={{fontSize:17,fontWeight:700,color:T.text,marginBottom:4}}>Balance générale</div>
        <div style={{fontSize:14,color:T.muted,marginBottom:12}}>Mouvements et soldes par compte</div>
        {!bal.lignes.length && <div style={{textAlign:"center",padding:20,color:T.muted,fontSize:15}}>Aucun compte mouvementé.</div>}
        {bal.lignes.map(l=>(
          <div key={l.compte} style={{padding:"8px 0",borderBottom:`1px solid ${T.border}`}}>
            <div style={{fontSize:15,fontWeight:700,color:T.text}}>{l.compte} — {l.libelle}</div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:T.muted,marginTop:3}}>
              <span>Mvt D {fmtN(l.mvtDebit)} · C {fmtN(l.mvtCredit)}</span>
              <span style={{color:T.text,fontWeight:700}}>
                {l.soldeDebiteur?`${fmtN(l.soldeDebiteur)} D`:`${fmtN(l.soldeCrediteur)} C`}
              </span>
            </div>
          </div>
        ))}
        {!!bal.lignes.length && <div style={{marginTop:12,paddingTop:10,borderTop:`2px solid ${T.accent}`}}>
          <Ligne g="Totaux mouvements" d={bal.totaux.mvtDebit} c={bal.totaux.mvtCredit} fort accent={T.accent}/>
          <Ligne g="Totaux soldes"     d={bal.totaux.soldeDebiteur} c={bal.totaux.soldeCrediteur} fort accent={T.accent}/>
          <div style={{marginTop:9,fontSize:14,color:bal.equilibree?T.green:T.red,fontWeight:700}}>
            {bal.equilibree?"✓ Balance équilibrée":"✗ Balance déséquilibrée — voir Contrôles"}
          </div>
        </div>}
      </Card>}

      {/* ── COMPTE DE RÉSULTAT ── */}
      {view==="resultat" && <Card>
        <div style={{fontSize:17,fontWeight:700,color:T.text,marginBottom:12}}>Compte de résultat</div>
        <div style={{fontSize:15,fontWeight:700,color:T.accent,marginTop:6,marginBottom:4}}>Produits (classe 7)</div>
        {res.produits.length?res.produits.map(x=><Ligne key={x.compte} g={`${x.compte} — ${x.libelle}`} c={x.montant}/>)
          :<div style={{fontSize:14,color:T.muted,padding:"6px 0"}}>Aucun produit enregistré.</div>}
        <Ligne g="Total produits" c={res.totalProduits} fort accent={T.accent}/>

        <div style={{fontSize:15,fontWeight:700,color:T.accent,marginTop:14,marginBottom:4}}>Charges (classe 6)</div>
        {res.charges.length?res.charges.map(x=><Ligne key={x.compte} g={`${x.compte} — ${x.libelle}`} d={x.montant}/>)
          :<div style={{fontSize:14,color:T.muted,padding:"6px 0"}}>Aucune charge enregistrée.</div>}
        <Ligne g="Total charges" d={res.totalCharges} fort accent={T.accent}/>

        <div style={{marginTop:14,padding:14,borderRadius:9,
                     background:(res.resultat>=0?T.green:T.red)+"12",
                     border:`1px solid ${(res.resultat>=0?T.green:T.red)}33`}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:17,fontWeight:800,
                       color:res.resultat>=0?T.green:T.red}}>
            <span>{res.resultat>=0?"Bénéfice net":"Perte nette"}</span>
            <span>{fmtN(Math.abs(res.resultat))} F</span>
          </div>
          <div style={{fontSize:13,color:T.muted,marginTop:5}}>
            Reporté automatiquement au passif du bilan, compte 120.
          </div>
        </div>
      </Card>}

      {/* ── BILAN ── */}
      {view==="bilan" && <Card>
        <div style={{fontSize:17,fontWeight:700,color:T.text,marginBottom:4}}>Bilan</div>
        <div style={{fontSize:14,color:T.muted,marginBottom:12}}>Au {today()} · SYSCOHADA révisé</div>

        <div style={{fontSize:15,fontWeight:700,color:T.accent,marginBottom:4}}>ACTIF</div>
        {bil.actif.length?bil.actif.map(s=>(
          <div key={s.section} style={{marginBottom:9}}>
            <div style={{fontSize:14,color:T.muted,marginTop:7}}>{s.section}</div>
            {s.lignes.map(l=><Ligne key={l.compte} g={`${l.compte} — ${l.libelle}`} d={s.negatif?-l.montant:l.montant}/>)}
          </div>
        )):<div style={{fontSize:14,color:T.muted,padding:"6px 0"}}>Actif vide.</div>}
        <Ligne g="TOTAL ACTIF" d={bil.totalActif} fort accent={T.accent}/>

        <div style={{fontSize:15,fontWeight:700,color:T.accent,marginTop:16,marginBottom:4}}>PASSIF</div>
        {bil.passif.map(s=>(
          <div key={s.section} style={{marginBottom:9}}>
            <div style={{fontSize:14,color:T.muted,marginTop:7}}>{s.section}</div>
            {s.lignes.map(l=><Ligne key={l.compte} g={`${l.compte} — ${l.libelle}`} c={l.montant}/>)}
          </div>
        ))}
        <div style={{fontSize:14,color:T.muted,marginTop:7}}>Résultat de l'exercice</div>
        <Ligne g="120 — Résultat net" c={bil.resultat}/>
        <Ligne g="TOTAL PASSIF" c={bil.totalPassif} fort accent={T.accent}/>

        <div style={{marginTop:14,padding:12,borderRadius:9,
                     background:(bil.equilibre?T.green:T.red)+"12",
                     border:`1px solid ${(bil.equilibre?T.green:T.red)}33`,fontSize:15,
                     color:bil.equilibre?T.green:T.red,fontWeight:700}}>
          {bil.equilibre
            ? "✓ Bilan équilibré — actif = passif"
            : `✗ Écart de ${fmtN(Math.abs(bil.ecart))} F entre actif et passif`}
        </div>
      </Card>}

      {/* ── CONTRÔLES ── */}
      {view==="ctrl" && <Card>
        <div style={{fontSize:17,fontWeight:700,color:T.text,marginBottom:4}}>Contrôles de cohérence</div>
        <div style={{fontSize:14,color:T.muted,marginBottom:12,lineHeight:1.6}}>
          Ce qu'un expert-comptable vérifie avant d'accepter un dossier.
        </div>
        {ctrl.map((x,i)=>{
          const col=x.n==="err"?T.red:x.n==="warn"?T.accent:x.n==="ok"?T.green:T.muted;
          const ic =x.n==="err"?"✗":x.n==="warn"?"⚠️":x.n==="ok"?"✓":"ℹ️";
          return(
            <div key={i} style={{display:"flex",gap:9,padding:11,marginBottom:7,borderRadius:8,
                                 background:col+"12",border:`1px solid ${col}33`}}>
              <span style={{color:col,fontSize:15}}>{ic}</span>
              <span style={{fontSize:15,color:T.text,lineHeight:1.55}}>{x.m}</span>
            </div>
          );
        })}
        <div style={{fontSize:13,color:T.muted,marginTop:10,lineHeight:1.6}}>
          Ces contrôles sont mécaniques. Ils ne remplacent pas la validation d'un
          expert-comptable agréé ONECCA-CI, qui seul engage sa responsabilité.
        </div>

        <div style={{marginTop:16,paddingTop:14,borderTop:`1px solid ${T.border}`}}>
          <div style={{fontSize:16,fontWeight:700,color:T.text,marginBottom:4}}>Taux de change</div>
          <div style={{fontSize:14,color:T.muted,lineHeight:1.65,marginBottom:10}}>
            L'euro est en parité fixe avec le franc CFA : 1 EUR = {PARITE_EUR} FCFA, inchangé
            depuis 1999. Le dollar flotte, il faut donc le saisir — sinon une facture en USD
            n'est pas comptabilisée, et l'application vous le signale plutôt que d'inventer
            un chiffre d'affaires.
          </div>
          <Inp label="1 USD = ... FCFA" value={taux} onChange={setTaux} placeholder="Ex. 580"/>
          <Btn sm onClick={()=>{
            const v=Number(taux);
            if(!v||v<=0){ notify("⚠️ Taux invalide",T.red); return; }
            Store.set(`akili_taux_${orgId}`,{usd:v,maj:today()});
            notify("✅ Taux USD enregistré");
          }}>✓ Enregistrer le taux</Btn>
          {!!tauxUSD(orgId) && <div style={{fontSize:13,color:T.muted,marginTop:7}}>
            Taux actuel : 1 USD = {fmtN(tauxUSD(orgId))} FCFA
            {Store.get(`akili_taux_${orgId}`,{})?.maj ? ` · saisi le ${Store.get(`akili_taux_${orgId}`,{}).maj}` : ""}
          </div>}
        </div>
      </Card>}

      {/* ── EXPORT ── */}
      {view==="export" && <Card>
        <div style={{fontSize:17,fontWeight:700,color:T.text,marginBottom:6}}>Export CSV OHADA</div>
        <div style={{fontSize:15,color:T.muted,lineHeight:1.65,marginBottom:12}}>
          Un fichier que votre expert-comptable ouvre dans Excel ou importe dans son logiciel.
          Colonnes : date, pièce, compte, intitulé, libellé, débit, crédit.
        </div>
        {!bal.equilibree && <div style={{padding:12,marginBottom:12,borderRadius:8,
             background:T.red+"12",border:`1px solid ${T.red}33`,fontSize:14,color:T.text,lineHeight:1.6}}>
          ⚠️ <b style={{color:T.red}}>Journal déséquilibré</b> de {fmtN(Math.abs(bal.totaux.mvtDebit-bal.totaux.mvtCredit))} F.
          L'export reste possible, mais votre comptable refusera un journal dans cet état. Voir l'onglet Contrôles.
        </div>}
        <Btn full disabled={!ecritures.length} onClick={exporterCSV}>
          📤 Télécharger le journal ({ecritures.length} écriture{ecritures.length>1?"s":""})
        </Btn>
        <div style={{fontSize:13,color:T.muted,marginTop:10,lineHeight:1.6}}>
          Rappel : ces écritures sont indicatives. Faites-les valider par un expert-comptable
          agréé ONECCA-CI avant tout dépôt auprès de la DGI.
        </div>
      </Card>}
    </div>
  );
}

function ChatTab({user,plan,notify,onUpgrade}){
  const HIST=`akili_chat_${user.uid}`;
  const [msgs,setMsgs]=useState(()=>Store.get(HIST,[{role:"assistant",content:`Bonjour **${user.name}** ! 🌍 Expert OHADA, stocks, RH et business.\n⚠️ *Mes réponses sont indicatives.*\nQue puis-je faire pour vous ?`}]));
  const [input,setInput]=useState(""); const [loading,setLoad]=useState(false); const [apiErr,setApiErr]=useState("");
  const endRef=useRef(null);
  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth"});},[msgs]);
  const saveMsgs=m=>{setMsgs(m);Store.set(HIST,m.slice(-30));};
  const send=async()=>{
    if(!input.trim()||loading) return;
    if(!QM.can(user.uid,plan)){notify("🚫 Quota IA épuisé",T.red);onUpgrade();return;}
    const next=[...msgs,{role:"user",content:input}];saveMsgs(next);setInput("");setLoad(true);setApiErr("");QM.inc(user.uid);
    try{
      const d=await appelIA({system:SYSTEM,messages:next.slice(-20).map(m=>({role:m.role,content:m.content}))});
      const txt=d.texte;
      saveMsgs([...next,{role:"assistant",content:txt}]);
    }catch(e){setApiErr(e.message);saveMsgs([...next,{role:"assistant",content:`❌ Erreur : ${e.message}`}]);}
    setLoad(false);
  };
  const fmt=t=>t.replace(/\*\*(.*?)\*\*/g,"<b>$1</b>").replace(/\*(.*?)\*/g,"<i>$1</i>").replace(/\n/g,"<br/>");
  const suggestions=["Écriture OHADA pour une vente","TVA 18% Côte d'Ivoire","Calcul CNPS employé","Point mort mon entreprise","Gestion stock saisonnière"];
  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{padding:"6px 16px",background:T.card2,borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:13,color:T.muted}}>🤖 Expert OHADA · Stocks · RH · ⚡{QM.left(user.uid,plan)===999?"∞":QM.left(user.uid,plan)}</span>
        <button onClick={()=>saveMsgs([msgs[0]])} style={{background:"none",border:"none",color:T.red,fontSize:13,cursor:"pointer"}}>🗑 Effacer</button>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:16}}>
        {msgs.map((m,i)=>(<div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start",marginBottom:9}}>{m.role==="assistant"&&<div style={{width:26,height:26,borderRadius:"50%",background:`linear-gradient(135deg,${T.accent},${T.accentD})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,marginRight:5,flexShrink:0,alignSelf:"flex-end"}}>🤖</div>}<div dangerouslySetInnerHTML={{__html:fmt(m.content)}} style={{maxWidth:"82%",padding:"9px 14px",fontSize:15,lineHeight:1.65,borderRadius:m.role==="user"?"13px 13px 3px 13px":"13px 13px 13px 3px",background:m.role==="user"?`linear-gradient(135deg,${T.accent},${T.accentD})`:T.card,border:m.role==="assistant"?`1px solid ${T.border}`:"none",color:m.role==="user"?"#000":T.text}}/></div>))}
        {loading&&<div style={{display:"flex",alignItems:"center",gap:5,marginBottom:9}}><div style={{width:26,height:26,borderRadius:"50%",background:`linear-gradient(135deg,${T.accent},${T.accentD})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13}}>🤖</div><div style={{padding:"9px 14px",background:T.card,border:`1px solid ${T.border}`,borderRadius:"13px 13px 13px 3px",display:"flex",gap:4}}>{[0,1,2].map(i=><div key={i} style={{width:5,height:5,borderRadius:"50%",background:T.accent,animation:`bounce 1.2s infinite`,animationDelay:`${i*.2}s`}}/>)}</div></div>}
        <div ref={endRef}/>
      </div>
      <div style={{padding:"5px 16px",display:"flex",gap:5,overflowX:"auto",background:T.card2,borderTop:`1px solid ${T.border}`}}>
        {suggestions.map(s=>(<button key={s} onClick={()=>setInput(s)} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:14,padding:"4px 12px",color:T.muted,fontSize:13,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"inherit"}}>{s}</button>))}
      </div>
      <div style={{padding:"9px 16px",background:T.card,borderTop:`1px solid ${T.border}`,display:"flex",gap:6}}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()} placeholder="Question OHADA, stocks, RH ou business..."
          style={{flex:1,background:T.bg,border:`1px solid ${T.border}`,borderRadius:18,padding:"9px 17px",color:T.text,fontSize:15,outline:"none",fontFamily:"inherit"}}/>
        <button onClick={send} disabled={loading} style={{width:42,height:42,borderRadius:"50%",background:loading?T.border:`linear-gradient(135deg,${T.accent},${T.accentD})`,border:"none",cursor:loading?"not-allowed":"pointer",fontSize:17}}>➤</button>
      </div>
    </div>
  );
}

// ─── ACHATS & FOURNISSEURS ────────────────────────────────────────
// Promis dans le Starter gratuit sur akili.africavit.com.
// Rattaché au plan comptable OHADA : 401 Fournisseurs, 601 Achats.
function AchatsTab({orgId,user,notify}){
  const FOURN=`akili_fourn_${orgId}`, ACH=`akili_achats_${orgId}`, ECR=`akili_ecrit_${orgId}`;
  const [view,setView]=useState("achats");
  const [fourn,setFourn]=useState(()=>Store.get(FOURN,[]));
  const [achats,setAchats]=useState(()=>Store.get(ACH,[]));
  const [page,setPage]=useState(0); const PP=10;
  const [errors,setErrors]=useState({});
  const vide={date:today(),fournisseur:"",designation:"",montantHT:"",tva:"18",statut:"En attente",piece:""};
  const [form,setForm]=useState(vide);
  const videF={nom:"",contact:"",tel:"",email:"",compte:"401",notes:""};
  const [formF,setFormF]=useState(videF);

  const saveF=l=>{setFourn(l);Store.set(FOURN,l);};
  const saveA=l=>{setAchats(l);Store.set(ACH,l);};

  const ttc=a=>Math.round(Number(a.montantHT||0)*(1+Number(a.tva||0)/100));
  const totalTTC  = achats.reduce((s,a)=>s+ttc(a),0);
  const totalImpaye = achats.filter(a=>a.statut!=="Payé").reduce((s,a)=>s+ttc(a),0);
  const totalTVA  = achats.reduce((s,a)=>s+Math.round(Number(a.montantHT||0)*Number(a.tva||0)/100),0);

  const validerAchat=()=>{
    const e={};
    if(!form.fournisseur) e.fournisseur="Fournisseur requis";
    if(!form.designation.trim()) e.designation="Désignation requise";
    if(!form.montantHT||isNaN(Number(form.montantHT))||Number(form.montantHT)<=0) e.montantHT="Montant invalide";
    setErrors(e); return !Object.keys(e).length;
  };
  const ajouterAchat=()=>{
    if(!validerAchat()) return;
    const a={...form,id:newId("ACH"),creeLe:today()};
    saveA([a,...achats]);
    comptabiliser(a);                    // automatique, sans clic
    setForm(vide); setErrors({}); setView("achats");
    notify("✅ Achat enregistré · écritures OHADA créées");
  };

  const validerFourn=()=>{
    const e={};
    if(!formF.nom.trim()) e.nom="Nom requis";
    if(formF.email&&!/\S+@\S+\.\S+/.test(formF.email)) e.email="Email invalide";
    setErrors(e); return !Object.keys(e).length;
  };
  const ajouterFourn=()=>{
    if(!validerFourn()) return;
    saveF([{...formF,id:newId("FRN"),creeLe:today()},...fourn]);
    setFormF(videF); setErrors({}); setView("fournisseurs");
    notify("✅ Fournisseur ajouté");
  };

  // Comptabilisation automatique : charge au débit, TVA déductible au
  // débit, dette fournisseur au crédit. Reposter le même achat remplace
  // ses écritures au lieu d'en créer de nouvelles.
  const comptabiliser=(a)=>{
    posterEcritures(orgId,a.id,ecrituresAchat({
      date:a.date, libelle:`Achat ${a.designation} — ${a.fournisseur}`,
      piece:a.piece||a.id, montantHT:Number(a.montantHT||0), tauxTVA:Number(a.tva||0),
      compteCharge:"601",
    }));
  };

  // Le règlement est une opération distincte : la dette s'éteint, la
  // trésorerie diminue. On ne réécrit pas la facture d'origine.
  const reglerAchat=(a)=>{
    saveA(achats.map(x=>x.id===a.id?{...x,statut:"Payé"}:x));
    posterEcritures(orgId,a.id+"-reg",[
      {date:today(),libelle:`Règlement ${a.fournisseur}`,piece:a.piece||a.id,journal:"BQ",compte:"401",debit:ttc(a),credit:0},
      {date:today(),libelle:`Règlement ${a.fournisseur}`,piece:a.piece||a.id,journal:"BQ",compte:"521",debit:0,credit:ttc(a)},
    ]);
    notify("✅ Réglé · écriture de trésorerie créée");
  };

  const supprimerAchat=(a)=>{
    saveA(achats.filter(x=>x.id!==a.id));
    retirerEcritures(orgId,a.id);
    retirerEcritures(orgId,a.id+"-reg");
    notify("🗑 Achat et ses écritures supprimés",T.red);
  };

  const sc=s=>s==="Payé"?T.green:s==="En attente"?T.accent:T.muted;
  const vus=achats.slice(page*PP,(page+1)*PP);

  return(
    <div style={{flex:1,overflowY:"auto",padding:12}}>
      <div style={{display:"flex",gap:6,marginBottom:12,overflowX:"auto"}}>
        {[["achats","🧾 Achats"],["fournisseurs","🏭 Fournisseurs"],["form","➕ Achat"],["formF","➕ Fournisseur"]].map(([v,l])=>(
          <Btn key={v} sm variant={view===v?"primary":"ghost"} onClick={()=>{setView(v);setErrors({});}}>{l}</Btn>
        ))}
      </div>

      {view==="achats" && <>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:12}}>
          <KPI icon="🧾" label="Total achats"  value={fmtM(totalTTC)+"F"}    sub={achats.length+" achat(s)"} color={T.accent}/>
          <KPI icon="⏳" label="Impayés"       value={fmtM(totalImpaye)+"F"} sub="À régler"                  color={totalImpaye>0?T.red:T.green}/>
          <KPI icon="🏭" label="Fournisseurs"  value={fourn.length}          sub="Référencés"                color={T.blue}/>
          <KPI icon="🧮" label="TVA déductible" value={fmtM(totalTVA)+"F"}   sub="Sur achats"                color={T.muted}/>
        </div>
        {!achats.length && <Card style={{textAlign:"center",padding:26,color:T.muted,fontSize:15}}>
          Aucun achat enregistré.<br/>Commencez par ajouter un fournisseur, puis saisissez vos factures d'achat.
        </Card>}
        {vus.map(a=>(
          <Card key={a.id} style={{marginBottom:9}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:9}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:16,fontWeight:700,color:T.text}}>{a.designation}</div>
                <div style={{fontSize:14,color:T.muted,marginTop:2}}>{a.fournisseur} · {a.date}{a.piece?` · pièce ${a.piece}`:""}</div>
              </div>
              <Badge label={a.statut} color={sc(a.statut)}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:9,paddingTop:9,borderTop:`1px solid ${T.border}`}}>
              <div style={{fontSize:14,color:T.muted}}>
                HT {fmtN(a.montantHT)} · TVA {a.tva}% · <b style={{color:T.text}}>TTC {fmtN(ttc(a))} F</b>
              </div>
              <div style={{display:"flex",gap:5}}>
                {a.statut!=="Payé" && <Btn sm variant="green" onClick={()=>reglerAchat(a)}>Régler</Btn>}
                <span style={{fontSize:13,color:T.green,alignSelf:"center"}}>📒 Comptabilisé</span>
                <Btn sm variant="danger" onClick={()=>supprimerAchat(a)}>🗑</Btn>
              </div>
            </div>
          </Card>
        ))}
        <Pager total={achats.length} page={page} pp={PP} onPage={setPage}/>
      </>}

      {view==="fournisseurs" && <>
        {!fourn.length && <Card style={{textAlign:"center",padding:26,color:T.muted,fontSize:15}}>
          Aucun fournisseur. Ajoutez-en un pour pouvoir saisir vos achats.
        </Card>}
        {fourn.map(f=>(
          <Card key={f.id} style={{marginBottom:9}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:9}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:16,fontWeight:700,color:T.text}}>{f.nom}</div>
                <div style={{fontSize:14,color:T.muted,marginTop:2}}>
                  {[f.contact,f.tel,f.email].filter(Boolean).join(" · ")||"—"}
                </div>
                <div style={{fontSize:13,color:T.muted,marginTop:3}}>Compte OHADA {f.compte}</div>
                {f.notes && <div style={{fontSize:14,color:T.text,marginTop:5}}>{f.notes}</div>}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                {f.tel && <Btn sm variant="ghost" onClick={()=>window.open(`https://wa.me/${f.tel.replace(/\D/g,"")}`,"_blank")}>📲</Btn>}
                <Btn sm variant="danger" onClick={()=>{saveF(fourn.filter(x=>x.id!==f.id));notify("🗑 Supprimé",T.red);}}>🗑</Btn>
              </div>
            </div>
          </Card>
        ))}
      </>}

      {view==="form" && <Card>
        <div style={{fontSize:17,fontWeight:700,color:T.text,marginBottom:12}}>Nouvel achat</div>
        <Inp label="Date" value={form.date} onChange={v=>setForm({...form,date:v})} placeholder="JJ/MM/AAAA"/>
        <Sel label="Fournisseur" required value={form.fournisseur} onChange={v=>setForm({...form,fournisseur:v})}
             options={[{value:"",label:fourn.length?"— Choisir —":"— Ajoutez d'abord un fournisseur —"},...fourn.map(f=>({value:f.nom,label:f.nom}))]}/>
        {errors.fournisseur && <div style={{color:T.red,fontSize:14,marginTop:-6,marginBottom:9}}>{errors.fournisseur}</div>}
        <Inp label="Désignation" required value={form.designation} onChange={v=>setForm({...form,designation:v})} placeholder="Ciment, carburant, fournitures..." error={errors.designation}/>
        <Inp label="Montant HT (FCFA)" required value={form.montantHT} onChange={v=>setForm({...form,montantHT:v})} placeholder="250000" error={errors.montantHT}/>
        <Sel label="TVA" value={form.tva} onChange={v=>setForm({...form,tva:v})}
             options={[{value:"18",label:"18 % — taux normal"},{value:"9",label:"9 % — taux réduit"},{value:"0",label:"0 % — exonéré"}]}/>
        <Sel label="Statut" value={form.statut} onChange={v=>setForm({...form,statut:v})}
             options={["En attente","Payé"]}/>
        <Inp label="N° de pièce" value={form.piece} onChange={v=>setForm({...form,piece:v})} placeholder="FACT-FRN-001"/>
        <div style={{padding:12,background:T.accentG,border:`1px solid ${T.accent}33`,borderRadius:8,fontSize:14,color:T.text,marginBottom:12,lineHeight:1.6}}>
          💡 Montant TTC : <b>{fmtN(ttc(form))} FCFA</b> — dont {fmtN(Math.round(Number(form.montantHT||0)*Number(form.tva||0)/100))} F de TVA déductible.
        </div>
        <Btn full onClick={ajouterAchat}>✓ Enregistrer l'achat</Btn>
      </Card>}

      {view==="formF" && <Card>
        <div style={{fontSize:17,fontWeight:700,color:T.text,marginBottom:12}}>Nouveau fournisseur</div>
        <Inp label="Nom" required value={formF.nom} onChange={v=>setFormF({...formF,nom:v})} placeholder="CIMAF Côte d'Ivoire" error={errors.nom}/>
        <Inp label="Contact" value={formF.contact} onChange={v=>setFormF({...formF,contact:v})} placeholder="Nom du commercial"/>
        <Inp label="Téléphone" value={formF.tel} onChange={v=>setFormF({...formF,tel:v})} placeholder="225XXXXXXXX"/>
        <Inp label="Email" value={formF.email} onChange={v=>setFormF({...formF,email:v})} placeholder="contact@fournisseur.ci" error={errors.email}/>
        <Sel label="Compte OHADA" value={formF.compte} onChange={v=>setFormF({...formF,compte:v})}
             options={[{value:"401",label:"401 — Fournisseurs"},{value:"402",label:"402 — Fournisseurs, effets à payer"},{value:"408",label:"408 — Fournisseurs, factures non parvenues"}]}/>
        <Inp label="Notes" value={formF.notes} onChange={v=>setFormF({...formF,notes:v})} placeholder="Délai de livraison, conditions..."/>
        <Btn full onClick={ajouterFourn}>✓ Ajouter le fournisseur</Btn>
      </Card>}
    </div>
  );
}

// ─── PROJETS (Kanban) ─────────────────────────────────────────────
// Promis dans le Business sur akili.africavit.com.
// Déplacement par boutons ← → plutôt que par glisser-déposer : sur un
// écran tactile, le glissé entre colonnes se confond avec le défilement.
function ProjetsTab({orgId,user,notify}){
  const KEY=`akili_projets_${orgId}`, CLI=`akili_clients_${orgId}`;
  const COLONNES=[
    {id:"afaire",  label:"À faire",  icon:"📋", color:T.muted},
    {id:"encours", label:"En cours", icon:"🚧", color:T.accent},
    {id:"termine", label:"Terminé",  icon:"✅", color:T.green},
  ];
  const [projets,setProjets]=useState(()=>Store.get(KEY,[]));
  const [view,setView]=useState("kanban");
  const [col,setCol]=useState("encours");
  const [errors,setErrors]=useState({});
  const vide={nom:"",client:"",budget:"",echeance:"",avancement:"0",colonne:"afaire",notes:""};
  const [form,setForm]=useState(vide);
  const clients=Store.get(CLI,[]);

  const save=l=>{setProjets(l);Store.set(KEY,l);};
  const deplacer=(p,sens)=>{
    const i=COLONNES.findIndex(c=>c.id===p.colonne);
    const j=Math.min(COLONNES.length-1,Math.max(0,i+sens));
    if(i===j) return;
    const maj={...p,colonne:COLONNES[j].id};
    if(COLONNES[j].id==="termine") maj.avancement="100";
    if(COLONNES[j].id==="afaire"&&p.avancement==="100") maj.avancement="0";
    save(projets.map(x=>x.id===p.id?maj:x));
    notify(`→ ${COLONNES[j].label}`);
  };

  const valider=()=>{
    const e={};
    if(!form.nom.trim()) e.nom="Nom requis";
    if(form.budget&&(isNaN(Number(form.budget))||Number(form.budget)<0)) e.budget="Montant invalide";
    const a=Number(form.avancement);
    if(isNaN(a)||a<0||a>100) e.avancement="Entre 0 et 100";
    setErrors(e); return !Object.keys(e).length;
  };
  const ajouter=()=>{
    if(!valider()) return;
    save([{...form,id:newId("PRJ"),creeLe:today()},...projets]);
    setForm(vide); setErrors({}); setView("kanban");
    notify("✅ Projet créé");
  };

  // Retard : échéance dépassée et projet non terminé
  const enRetard=p=>{
    if(!p.echeance||p.colonne==="termine") return false;
    const [j,m,a]=p.echeance.split("/");
    if(!a) return false;
    return new Date(`${a}-${m}-${j}`) < new Date(new Date().toDateString());
  };

  const budgetTotal  = projets.reduce((s,p)=>s+Number(p.budget||0),0);
  const budgetEnCours= projets.filter(p=>p.colonne==="encours").reduce((s,p)=>s+Number(p.budget||0),0);
  const retards      = projets.filter(enRetard).length;

  const Carte=({p})=>{
    const i=COLONNES.findIndex(c=>c.id===p.colonne);
    const retard=enRetard(p);
    return(
      <Card style={{marginBottom:9,border:`1px solid ${retard?T.red+"55":T.border}`}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:9}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:16,fontWeight:700,color:T.text}}>{p.nom}</div>
            {p.client && <div style={{fontSize:14,color:T.muted,marginTop:2}}>👥 {p.client}</div>}
          </div>
          {retard && <Badge label="En retard" color={T.red}/>}
        </div>

        <div style={{marginTop:9}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:T.muted,marginBottom:4}}>
            <span>Avancement</span><span style={{color:T.text,fontWeight:700}}>{p.avancement}%</span>
          </div>
          <div style={{height:6,background:T.light,borderRadius:3,overflow:"hidden"}}>
            <div style={{width:`${Math.min(100,Number(p.avancement||0))}%`,height:"100%",
                         background:`linear-gradient(90deg,${T.accent},${T.accentD})`,transition:"width .3s"}}/>
          </div>
        </div>

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:9,
                     paddingTop:9,borderTop:`1px solid ${T.border}`,gap:6,flexWrap:"wrap"}}>
          <div style={{fontSize:14,color:T.muted}}>
            {p.budget?<b style={{color:T.text}}>{fmtN(p.budget)} F</b>:"—"}
            {p.echeance?` · ⏱ ${p.echeance}`:""}
          </div>
          <div style={{display:"flex",gap:5}}>
            <Btn sm variant="ghost" disabled={i===0} onClick={()=>deplacer(p,-1)}>←</Btn>
            <Btn sm variant="ghost" disabled={i===COLONNES.length-1} onClick={()=>deplacer(p,1)}>→</Btn>
            <Btn sm variant="danger" onClick={()=>{save(projets.filter(x=>x.id!==p.id));notify("🗑 Supprimé",T.red);}}>🗑</Btn>
          </div>
        </div>
      </Card>
    );
  };

  const deCol = projets.filter(p=>p.colonne===col);

  return(
    <div style={{flex:1,overflowY:"auto",padding:12}}>
      <div style={{display:"flex",gap:6,marginBottom:12}}>
        <Btn sm variant={view==="kanban"?"primary":"ghost"} onClick={()=>setView("kanban")}>📊 Tableau</Btn>
        <Btn sm variant={view==="form"?"primary":"ghost"}   onClick={()=>{setView("form");setErrors({});}}>➕ Projet</Btn>
      </div>

      {view==="kanban" && <>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:12}}>
          <KPI icon="📁" label="Projets"      value={projets.length}            sub={`${projets.filter(p=>p.colonne==="encours").length} en cours`} color={T.accent}/>
          <KPI icon="💰" label="Budget total" value={fmtM(budgetTotal)+"F"}     sub={`${fmtM(budgetEnCours)}F en cours`}                            color={T.blue}/>
        </div>
        {retards>0 && <Card style={{marginBottom:12,background:T.red+"12",border:`1px solid ${T.red}33`,fontSize:15,color:T.text}}>
          ⚠️ <b style={{color:T.red}}>{retards} projet{retards>1?"s":""} en retard</b> — échéance dépassée et non terminé.
        </Card>}

        <div style={{display:"flex",gap:6,marginBottom:12,overflowX:"auto"}}>
          {COLONNES.map(c=>{
            const n=projets.filter(p=>p.colonne===c.id).length;
            return <Btn key={c.id} sm variant={col===c.id?"primary":"ghost"} onClick={()=>setCol(c.id)}>{c.icon} {c.label} ({n})</Btn>;
          })}
        </div>

        {!deCol.length && <Card style={{textAlign:"center",padding:26,color:T.muted,fontSize:15}}>
          Aucun projet dans « {COLONNES.find(c=>c.id===col)?.label} ».
          {col==="afaire" && <><br/>Créez un projet pour commencer.</>}
        </Card>}
        {deCol.map(p=><Carte key={p.id} p={p}/>)}
      </>}

      {view==="form" && <Card>
        <div style={{fontSize:17,fontWeight:700,color:T.text,marginBottom:12}}>Nouveau projet</div>
        <Inp label="Nom du projet" required value={form.nom} onChange={v=>setForm({...form,nom:v})} placeholder="Chantier Songon, lot 3" error={errors.nom}/>
        <Sel label="Client" value={form.client} onChange={v=>setForm({...form,client:v})}
             options={[{value:"",label:clients.length?"— Aucun —":"— Aucun client enregistré —"},...clients.map(c=>({value:c.nom,label:c.nom}))]}/>
        <Inp label="Budget (FCFA)" value={form.budget} onChange={v=>setForm({...form,budget:v})} placeholder="6000000" error={errors.budget}/>
        <Inp label="Échéance" value={form.echeance} onChange={v=>setForm({...form,echeance:v})} placeholder="JJ/MM/AAAA"/>
        <Inp label="Avancement (%)" value={form.avancement} onChange={v=>setForm({...form,avancement:v})} placeholder="0" error={errors.avancement}/>
        <Sel label="Colonne de départ" value={form.colonne} onChange={v=>setForm({...form,colonne:v})}
             options={COLONNES.map(c=>({value:c.id,label:`${c.icon} ${c.label}`}))}/>
        <Inp label="Notes" value={form.notes} onChange={v=>setForm({...form,notes:v})} placeholder="Détails, intervenants..."/>
        <Btn full onClick={ajouter}>✓ Créer le projet</Btn>
      </Card>}
    </div>
  );
}

// ─── SIGNATURE ÉLECTRONIQUE ───────────────────────────────────────
// Promise dans le Starter gratuit sur akili.africavit.com.
//
// Ce qui est produit ici est une SIGNATURE ÉLECTRONIQUE SIMPLE :
// le tracé manuscrit, l'identité déclarée du signataire, l'horodatage,
// et une empreinte SHA-256 du contenu signé. L'empreinte prouve qu'un
// document présenté plus tard est bien celui qui a été signé : un seul
// caractère modifié change l'empreinte.
//
// Ce qu'elle n'est PAS : une signature avancée ou qualifiée au sens du
// règlement eIDAS ou de l'acte uniforme OHADA. Elle n'est pas adossée à
// un certificat délivré par un tiers de confiance, et l'identité du
// signataire est déclarative. Pour un contrat à fort enjeu — cession de
// parts, garantie bancaire, marché public — il faut un prestataire
// certifié. L'interface le dit à l'utilisateur, elle ne le cache pas.
function SignatureTab({orgId,user,notify}){
  const KEY=`akili_sign_${orgId}`, DOCS=`akili_docs_${orgId}`;
  const [sigs,setSigs]=useState(()=>Store.get(KEY,[]));
  const [view,setView]=useState("liste");
  const [docId,setDocId]=useState("");
  const [nom,setNom]=useState(user?.name||"");
  const [qualite,setQualite]=useState("");
  const [errors,setErrors]=useState({});
  const [trace,setTrace]=useState(false);
  const cvRef=useRef(null), dessine=useRef(false);
  const docs=Store.get(DOCS,[]);
  const save=l=>{setSigs(l);Store.set(KEY,l);};

  // ─── Canvas ───
  const pos=(e)=>{
    const c=cvRef.current, r=c.getBoundingClientRect();
    const t=e.touches?.[0];
    return { x:((t?t.clientX:e.clientX)-r.left)*(c.width/r.width),
             y:((t?t.clientY:e.clientY)-r.top)*(c.height/r.height) };
  };
  const start=(e)=>{ e.preventDefault(); dessine.current=true; const c=cvRef.current.getContext("2d");
    const p=pos(e); c.beginPath(); c.moveTo(p.x,p.y); };
  const move=(e)=>{ if(!dessine.current) return; e.preventDefault();
    const c=cvRef.current.getContext("2d"); const p=pos(e);
    c.lineTo(p.x,p.y); c.strokeStyle="#EDF3F9"; c.lineWidth=2.5; c.lineCap="round"; c.lineJoin="round"; c.stroke();
    setTrace(true); };
  const end=()=>{ dessine.current=false; };
  const effacer=()=>{ const c=cvRef.current; c.getContext("2d").clearRect(0,0,c.width,c.height); setTrace(false); };

  const empreinte=async(txt)=>{
    try{
      const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(txt));
      return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("");
    }catch{ return null; }
  };

  const signer=async()=>{
    const e={};
    if(!docId) e.docId="Choisissez un document";
    if(!nom.trim()) e.nom="Nom du signataire requis";
    if(!trace) e.trace="Tracez votre signature dans le cadre";
    setErrors(e); if(Object.keys(e).length) return;

    const doc=docs.find(d=>d.id===docId);
    const horodatage=new Date().toISOString();
    const contenu=`${doc?.type||""}|${doc?.client||""}|${doc?.montant||""}|${doc?.contenu||doc?.texte||""}`;
    const h=await empreinte(`${contenu}|${nom}|${qualite}|${horodatage}`);
    if(!h){ notify("❌ Empreinte impossible (navigateur trop ancien)",T.red); return; }

    save([{
      id:newId("SIG"), docId, docType:doc?.type||"document", docClient:doc?.client||"",
      nom:nom.trim(), qualite:qualite.trim(), horodatage, dateLisible:today(),
      empreinte:h, image:cvRef.current.toDataURL("image/png"),
    },...sigs]);
    effacer(); setQualite(""); setDocId(""); setErrors({}); setView("liste");
    notify("✍️ Document signé");
  };

  const partager=(s)=>{
    const txt=`Signature électronique AKILI ERP\n\n`+
      `Document : ${s.docType}${s.docClient?` — ${s.docClient}`:""}\n`+
      `Signataire : ${s.nom}${s.qualite?` (${s.qualite})`:""}\n`+
      `Date : ${new Date(s.horodatage).toLocaleString("fr-FR")}\n`+
      `Empreinte SHA-256 : ${s.empreinte}\n\n`+
      `Signature électronique simple — ${EDITEUR.nom}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`,"_blank");
  };

  return(
    <div style={{flex:1,overflowY:"auto",padding:12}}>
      <div style={{display:"flex",gap:6,marginBottom:12}}>
        <Btn sm variant={view==="liste"?"primary":"ghost"} onClick={()=>setView("liste")}>📜 Signés ({sigs.length})</Btn>
        <Btn sm variant={view==="signer"?"primary":"ghost"} onClick={()=>{setView("signer");setErrors({});}}>✍️ Signer</Btn>
      </div>

      <Card style={{marginBottom:12,background:T.accentG,border:`1px solid ${T.accent}33`,fontSize:14,color:T.text,lineHeight:1.65}}>
        ℹ️ <b style={{color:T.accent}}>Signature électronique simple.</b> Le tracé, l'identité déclarée,
        l'horodatage et une empreinte du contenu sont conservés : toute modification ultérieure du document
        change l'empreinte et devient détectable.
        <div style={{marginTop:6,color:T.muted}}>
          Ce n'est pas une signature qualifiée adossée à un certificat. Pour un contrat à fort enjeu
          (cession de parts, garantie bancaire, marché public), passez par un prestataire certifié.
        </div>
      </Card>

      {view==="signer" && <Card>
        <Sel label="Document à signer" required value={docId} onChange={v=>{setDocId(v);setErrors({...errors,docId:""});}}
             options={[{value:"",label:docs.length?"— Choisir —":"— Aucun document généré —"},
                       ...docs.map(d=>({value:d.id,label:`${d.type||"document"} — ${d.client||"sans client"}`}))]}/>
        {errors.docId && <div style={{color:T.red,fontSize:14,marginTop:-6,marginBottom:9}}>{errors.docId}</div>}

        <Inp label="Nom du signataire" required value={nom} onChange={v=>setNom(v)} placeholder="DIBY Honoré" error={errors.nom}/>
        <Inp label="Qualité" value={qualite} onChange={setQualite} placeholder="Gérant, Directeur, Client..."/>

        <div style={{fontSize:14,color:T.muted,marginBottom:3,textTransform:"uppercase",letterSpacing:".5px"}}>
          Signature <span style={{color:T.red}}>*</span>
        </div>
        <div style={{border:`1px solid ${errors.trace?T.red:T.border}`,borderRadius:8,background:T.bg,marginBottom:6,touchAction:"none"}}>
          <canvas ref={cvRef} width={560} height={200}
            onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
            onTouchStart={start} onTouchMove={move} onTouchEnd={end}
            style={{width:"100%",height:140,display:"block",cursor:"crosshair",touchAction:"none"}}/>
        </div>
        {errors.trace && <div style={{color:T.red,fontSize:14,marginBottom:9}}>{errors.trace}</div>}
        <div style={{display:"flex",gap:6,marginBottom:12}}>
          <Btn sm variant="ghost" onClick={effacer}>🧹 Effacer</Btn>
          <span style={{fontSize:13,color:T.muted,alignSelf:"center"}}>Tracez avec le doigt</span>
        </div>

        <Btn full onClick={signer}>✍️ Signer et sceller</Btn>
      </Card>}

      {view==="liste" && <>
        {!sigs.length && <Card style={{textAlign:"center",padding:26,color:T.muted,fontSize:15}}>
          Aucun document signé.<br/>Générez un document dans l'onglet Documents, puis signez-le ici.
        </Card>}
        {sigs.map(s=>(
          <Card key={s.id} style={{marginBottom:9}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:9,alignItems:"flex-start"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:16,fontWeight:700,color:T.text,textTransform:"capitalize"}}>
                  {s.docType}{s.docClient?` — ${s.docClient}`:""}
                </div>
                <div style={{fontSize:14,color:T.muted,marginTop:2}}>
                  {s.nom}{s.qualite?` · ${s.qualite}`:""}
                </div>
                <div style={{fontSize:13,color:T.muted,marginTop:2}}>
                  {new Date(s.horodatage).toLocaleString("fr-FR")}
                </div>
              </div>
              <Badge label="Signé" color={T.green}/>
            </div>
            {s.image && <div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,marginTop:9,padding:6}}>
              <img src={s.image} alt="Signature" style={{width:"100%",maxHeight:90,objectFit:"contain",display:"block"}}/>
            </div>}
            <div style={{marginTop:9,paddingTop:9,borderTop:`1px solid ${T.border}`}}>
              <div style={{fontSize:13,color:T.muted,marginBottom:3}}>Empreinte SHA-256</div>
              <div style={{fontSize:12,color:T.text,fontFamily:"monospace",wordBreak:"break-all",lineHeight:1.5}}>{s.empreinte}</div>
            </div>
            <div style={{display:"flex",gap:5,marginTop:9}}>
              <Btn sm variant="ghost" onClick={()=>partager(s)}>📲 Partager le certificat</Btn>
              <Btn sm variant="danger" onClick={()=>{save(sigs.filter(x=>x.id!==s.id));notify("🗑 Supprimé",T.red);}}>🗑</Btn>
            </div>
          </Card>
        ))}
      </>}
    </div>
  );
}

const CSS=`
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap');
  *{font-family:'Outfit',sans-serif;box-sizing:border-box;}
  ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#202C3C;border-radius:2px}
  input::placeholder,textarea::placeholder{color:#8095AB}
  select option{background:#0C1219}
  @keyframes bounce{0%,80%,100%{transform:scale(.8);opacity:.5}40%{transform:scale(1.2);opacity:1}}
  @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
`;
