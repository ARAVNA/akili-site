import { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
         PieChart, Pie, Cell, LineChart, Line, CartesianGrid, AreaChart, Area } from "recharts";

// ═══════════════════════════════════════════════════════════════════
// AKILI ERP v8 — ÉDITION COMPLÈTE
// ✅ Option A : KPIs avancés (taux conversion, point mort, prévision trésorerie)
// ✅ Option C : Gestion stocks + Module RH/Paie
// + Tous les correctifs précédents
// ═══════════════════════════════════════════════════════════════════

// ─── THÈME ────────────────────────────────────────────────────────
const T = {
  bg:"#05080F", card:"#0C1219", card2:"#101820", border:"#1A2535",
  accent:"#F59E0B", accentD:"#92400E", accentG:"#F59E0B15",
  green:"#10B981", red:"#EF4444", blue:"#60A5FA", purple:"#A78BFA",
  orange:"#FB923C", cyan:"#22D3EE", indigo:"#818CF8",
  text:"#E8F4FF", muted:"#4D6680", light:"#131E2B",
};

// ─── PLANS ────────────────────────────────────────────────────────
const PLANS = {
  starter:    { label:"Starter",    color:T.blue,   prix:5000,  quota:30,  docs:20  },
  business:   { label:"Business",   color:T.accent, prix:15000, quota:150, docs:999 },
  enterprise: { label:"Entreprise", color:T.purple, prix:50000, quota:999, docs:999 },
};

// ─── STORAGE ──────────────────────────────────────────────────────
const Store = {
  get:(k,d=[])=>{ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch{ return d; } },
  set:(k,v)=>{ try{ const s=JSON.stringify(v); if(s.length>4_000_000&&Array.isArray(v)) return Store.set(k,v.slice(0,50)); localStorage.setItem(k,s); return true; }catch(e){ if(e.name==="QuotaExceededError"){ try{ const a=Store.get(k,[]); if(Array.isArray(a)) localStorage.setItem(k,JSON.stringify(a.slice(0,20))); }catch{} } return false; } },
  size:()=>{ try{ let t=0; for(let k in localStorage) if(localStorage.hasOwnProperty(k)) t+=localStorage[k].length; return Math.round(t/1024); }catch{ return 0; } },
};

// ─── QUOTA ────────────────────────────────────────────────────────
const QM = {
  key:(uid)=>`akili_q_${uid}_${new Date().getMonth()}_${new Date().getFullYear()}`,
  usage:(uid)=>Store.get(QM.key(uid),{count:0}),
  inc:(uid)=>{ const u=QM.usage(uid); Store.set(QM.key(uid),{count:u.count+1}); return u.count+1; },
  can:(uid,plan)=>QM.usage(uid).count<(PLANS[plan]?.quota||30),
  left:(uid,plan)=>Math.max(0,(PLANS[plan]?.quota||30)-QM.usage(uid).count),
};

// ─── AUTH ─────────────────────────────────────────────────────────
const AuthCtx = createContext(null);
const useAuth = ()=>useContext(AuthCtx);

function AuthProvider({children}){
  const [user,setUser]=useState(()=>{ try{ return JSON.parse(sessionStorage.getItem("akili_s")); }catch{ return null; } });
  const save=u=>{ if(u) sessionStorage.setItem("akili_s",JSON.stringify(u)); else sessionStorage.removeItem("akili_s"); setUser(u); };
  const register=(email,pass,name,ent)=>{
    const us=Store.get("akili_users",{});
    if(!email||!pass||!name) throw new Error("Tous les champs sont requis.");
    if(pass.length<6) throw new Error("Mot de passe : 6 caractères minimum.");
    if(!/\S+@\S+\.\S+/.test(email)) throw new Error("Email invalide.");
    if(us[email]) throw new Error("Compte déjà existant.");
    const uid="uid_"+Date.now();
    us[email]={uid,name,email,entreprise:ent,orgId:uid,role:"admin",plan:"starter",createdAt:today()};
    Store.set("akili_users",us);
    const u={uid,email,name,entreprise:ent,orgId:uid,role:"admin",plan:"starter"};
    save(u); return u;
  };
  const login=(email,pass)=>{
    if(!email||!pass) throw new Error("Email et mot de passe requis.");
    const us=Store.get("akili_users",{});
    if(!us[email]) throw new Error("Aucun compte trouvé.");
    save({...us[email]}); return us[email];
  };
  const logout=()=>save(null);
  const upgradePlan=p=>{ const u={...user,plan:p}; save(u); const us=Store.get("akili_users",{}); if(us[user.email]){ us[user.email].plan=p; Store.set("akili_users",us); } };
  return <AuthCtx.Provider value={{user,register,login,logout,upgradePlan}}>{children}</AuthCtx.Provider>;
}

// ─── UTILS ────────────────────────────────────────────────────────
const fmtN  = n=>Number(n||0).toLocaleString("fr-FR");
const fmtM  = n=>{ const v=Number(n||0); return v>=1e6?`${(v/1e6).toFixed(1)}M`:v>=1e3?`${(v/1e3).toFixed(0)}K`:`${Math.round(v)}`; };
const today = ()=>new Date().toLocaleDateString("fr-FR");
const newId = p=>`${p}-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
const SYSTEM = `Tu es AKILI ERP, expert OHADA, gestion stocks, RH/paie et business pour entrepreneurs africains francophones. FCFA, Mobile Money, PME ivoiriennes. Concis et pratique. Rappelle toujours que tes réponses sont indicatives.`;

// ─── BASE UI ──────────────────────────────────────────────────────
const Btn=({children,onClick,variant="primary",disabled,full,sm,style={}})=>(
  <button onClick={onClick} disabled={disabled} style={{padding:sm?"5px 11px":"9px 16px",borderRadius:8,border:"none",cursor:disabled?"not-allowed":"pointer",fontFamily:"inherit",fontSize:sm?11:13,fontWeight:700,transition:"all .18s",width:full?"100%":"auto",background:variant==="primary"?`linear-gradient(135deg,${T.accent},${T.accentD})`:variant==="danger"?T.red:variant==="green"?T.green:variant==="blue"?T.blue:variant==="ghost"?"transparent":T.light,color:variant==="primary"?"#000":variant==="ghost"?T.muted:T.text,border:variant==="ghost"?`1px solid ${T.border}`:"none",opacity:disabled?.5:1,...style}}>{children}</button>
);
const Inp=({label,value,onChange,placeholder,type="text",required,error,style={}})=>(
  <div style={{marginBottom:10}}>
    {label&&<div style={{fontSize:10,color:T.muted,marginBottom:3,textTransform:"uppercase",letterSpacing:".5px"}}>{label}{required&&<span style={{color:T.red}}> *</span>}</div>}
    <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{width:"100%",background:T.bg,border:`1px solid ${error?T.red:T.border}`,borderRadius:8,padding:"9px 12px",color:T.text,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit",...style}}/>
    {error&&<div style={{fontSize:10,color:T.red,marginTop:3}}>⚠ {error}</div>}
  </div>
);
const Sel=({label,value,onChange,options,required})=>(
  <div style={{marginBottom:10}}>
    {label&&<div style={{fontSize:10,color:T.muted,marginBottom:3,textTransform:"uppercase",letterSpacing:".5px"}}>{label}{required&&<span style={{color:T.red}}> *</span>}</div>}
    <select value={value} onChange={e=>onChange(e.target.value)} style={{width:"100%",background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 12px",color:T.text,fontSize:13,outline:"none",fontFamily:"inherit"}}>
      {options.map(o=><option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
    </select>
  </div>
);
const Card=({children,style={}})=>(<div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:14,...style}}>{children}</div>);
const Badge=({label,color})=>(<span style={{padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:700,background:color+"22",color,border:`1px solid ${color}33`}}>{label}</span>);
const Toast=({n})=>n?(<div style={{position:"fixed",top:12,left:"50%",transform:"translateX(-50%)",background:n.color,color:"#fff",padding:"9px 20px",borderRadius:20,fontSize:12,fontWeight:700,zIndex:999,boxShadow:"0 4px 24px #0008",maxWidth:"90vw",textAlign:"center"}}>{n.msg}</div>):null;
const Pager=({total,page,pp,onPage})=>{ const pages=Math.ceil(total/pp); if(pages<=1) return null; return(<div style={{display:"flex",justifyContent:"center",gap:6,padding:"10px 0"}}><Btn variant="ghost" sm disabled={page===0} onClick={()=>onPage(page-1)}>←</Btn><span style={{fontSize:11,color:T.muted,alignSelf:"center"}}>{page+1}/{pages}</span><Btn variant="ghost" sm disabled={page>=pages-1} onClick={()=>onPage(page+1)}>→</Btn></div>); };
const KPI=({icon,label,value,sub,color,onClick})=>(<Card style={{padding:12,background:T.card2,border:`1px solid ${color}18`,cursor:onClick?"pointer":"default"}} onClick={onClick}><div style={{fontSize:16,marginBottom:3}}>{icon}</div><div style={{fontSize:15,fontWeight:800,color,lineHeight:1,marginBottom:2}}>{value}</div><div style={{fontSize:11,fontWeight:700,color:T.text}}>{label}</div>{sub&&<div style={{fontSize:9,color:T.muted,marginTop:1}}>{sub}</div>}</Card>);

// ─── DISCLAIMER ───────────────────────────────────────────────────
function Disclaimer({onAccept}){
  const [c1,setC1]=useState(false); const [c2,setC2]=useState(false); const [c3,setC3]=useState(false);
  const ok=c1&&c2&&c3;
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.88)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <Card style={{width:"100%",maxWidth:440,padding:24,maxHeight:"92vh",overflowY:"auto"}}>
        <div style={{textAlign:"center",marginBottom:18}}><div style={{fontSize:32,marginBottom:8}}>⚖️</div><div style={{fontSize:16,fontWeight:800}}>Conditions d'utilisation</div><div style={{fontSize:11,color:T.muted,marginTop:4}}>À lire avant d'utiliser AKILI ERP</div></div>
        {[[T.red,"⚠️ Avertissement","Les documents, conseils et états financiers générés par AKILI ERP sont fournis à titre indicatif uniquement. Ils ne constituent pas un conseil juridique, comptable ou fiscal certifié. Les contrats doivent être validés par un juriste, les écritures OHADA par un expert-comptable agréé ONECCA-CI, et les déclarations fiscales par un professionnel DGI."],
          [T.orange,"📋 Responsabilité","INTELLIGENCIA MEDIA (IMEDIA) ne peut être tenu responsable des erreurs dans les documents générés par l'IA, des redressements fiscaux, des litiges contractuels, ni des pertes financières résultant d'une utilisation sans validation professionnelle."],
          [T.green,"✅ Engagement","En acceptant, vous vous engagez à faire valider les documents importants par des professionnels qualifiés, à conserver vos pièces justificatives 10 ans (OHADA), et à soumettre vos déclarations fiscales via les canaux officiels DGI agréés."]
        ].map(([col,titre,texte])=>(
          <div key={titre} style={{background:col+"12",border:`1px solid ${col}33`,borderRadius:9,padding:12,marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,color:col,marginBottom:6}}>{titre}</div>
            <div style={{fontSize:11,color:T.text,lineHeight:1.65}}>{texte}</div>
          </div>
        ))}
        <div style={{marginBottom:18}}>
          <div style={{fontSize:11,fontWeight:700,marginBottom:10}}>Confirmez votre accord :</div>
          {[[c1,setC1,"Les documents générés sont indicatifs et doivent être validés par des professionnels qualifiés."],
            [c2,setC2,"IMEDIA n'est pas responsable des erreurs dans les documents générés par l'IA."],
            [c3,setC3,"J'accepte les conditions et m'engage à utiliser AKILI ERP de manière responsable."]
          ].map(([checked,set,txt],i)=>(
            <div key={i} onClick={()=>set(!checked)} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"9px 11px",background:checked?T.green+"12":T.light,borderRadius:8,marginBottom:7,border:`1px solid ${checked?T.green:T.border}`,cursor:"pointer",transition:"all .2s"}}>
              <div style={{width:18,height:18,borderRadius:4,flexShrink:0,marginTop:1,background:checked?T.green:T.bg,border:`2px solid ${checked?T.green:T.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#fff"}}>{checked?"✓":""}</div>
              <span style={{fontSize:11,color:T.text,lineHeight:1.6}}>{txt}</span>
            </div>
          ))}
        </div>
        <Btn onClick={onAccept} disabled={!ok} full style={{padding:13}}>{ok?"✅ J'accepte — Accéder à AKILI ERP":"Cochez les 3 cases pour continuer"}</Btn>
        <div style={{textAlign:"center",marginTop:10,fontSize:10,color:T.muted}}>INTELLIGENCIA MEDIA (IMEDIA) · Abidjan, Cocody-Angré · www.intelligenciamedia.com</div>
      </Card>
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────
export default function App(){ return <AuthProvider><AppInner/></AuthProvider>; }
function AppInner(){
  const {user}=useAuth();
  const [disc,setDisc]=useState(()=>!!localStorage.getItem("akili_disc"));
  if(!user) return <AuthScreen/>;
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
  const handle=async()=>{ setMsg(""); if(!validate()) return; setLoad(true); try{ if(mode==="login") login(email,pass); else{ register(email,pass,name,ent); setMsg("✅ Compte créé !"); } }catch(e){ setErrors({global:e.message}); } setLoad(false); };
  return(
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backgroundImage:`radial-gradient(ellipse at 20% 50%,${T.accentG} 0%,transparent 55%)`}}>
      <div style={{width:"100%",maxWidth:360}}>
        <div style={{textAlign:"center",marginBottom:22}}>
          <div style={{width:60,height:60,borderRadius:18,background:`linear-gradient(135deg,${T.accent},${T.accentD})`,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:26,marginBottom:12}}>🌍</div>
          <div style={{fontSize:22,fontWeight:800,color:T.text}}>AKILI ERP</div>
          <div style={{fontSize:11,color:T.muted,marginTop:3}}>Gestion · Stocks · RH · OHADA · IA</div>
        </div>
        <Card style={{padding:22}}>
          <div style={{fontWeight:800,fontSize:14,marginBottom:14}}>{mode==="login"?"Connexion":"Créer un compte"}</div>
          {mode==="register"&&<Inp label="Nom complet" value={name} onChange={setName} placeholder="DIBY Honoré" required error={errors.name}/>}
          {mode==="register"&&<Inp label="Entreprise" value={ent} onChange={setEnt} placeholder="INTELLIGENCIA MEDIA"/>}
          <Inp label="Email" value={email} onChange={v=>{setEmail(v);setErrors(p=>({...p,email:""}));}} placeholder="vous@imedia.ci" type="email" required error={errors.email}/>
          <Inp label="Mot de passe" value={pass} onChange={v=>{setPass(v);setErrors(p=>({...p,pass:""}));}} placeholder="Min. 6 caractères" type="password" required error={errors.pass}/>
          {errors.global&&<div style={{padding:"7px 10px",background:T.red+"15",border:`1px solid ${T.red}33`,borderRadius:7,color:T.red,fontSize:12,marginBottom:10}}>⚠ {errors.global}</div>}
          {msg&&<div style={{padding:"7px 10px",background:T.green+"15",border:`1px solid ${T.green}33`,borderRadius:7,color:T.green,fontSize:12,marginBottom:10}}>{msg}</div>}
          <Btn onClick={handle} disabled={load} full style={{padding:12,marginTop:4}}>{load?"⏳...":mode==="login"?"🔐 Se connecter":"✨ Créer mon compte"}</Btn>
          <div style={{marginTop:12,textAlign:"center",fontSize:12,color:T.muted}}>
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
  const {user,logout,upgradePlan}=useAuth();
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
    {id:"compta",  icon:"📒",label:"OHADA"},
    {id:"chat",    icon:"🤖",label:"IA"},
  ];
  return(
    <div style={{minHeight:"100vh",background:T.bg,color:T.text,display:"flex",flexDirection:"column"}}>
      <Toast n={notif}/>
      <div style={{background:T.card,borderBottom:`1px solid ${T.border}`,padding:"9px 14px",display:"flex",alignItems:"center",gap:9,position:"sticky",top:0,zIndex:20}}>
        <div style={{width:28,height:28,borderRadius:7,background:`linear-gradient(135deg,${T.accent},${T.accentD})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13}}>🌍</div>
        <div>
          <div style={{fontWeight:800,fontSize:11,display:"flex",alignItems:"center",gap:5}}>
            AKILI ERP <span style={{fontSize:9,padding:"1px 5px",borderRadius:4,background:PLANS[plan].color+"22",color:PLANS[plan].color}}>{PLANS[plan].label}</span>
          </div>
          <div style={{fontSize:9,color:T.muted}}>{user.entreprise||user.name}</div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:6,alignItems:"center"}}>
          <span style={{fontSize:9,color:T.muted}}>⚡{QM.left(user.uid,plan)===999?"∞":QM.left(user.uid,plan)}</span>
          <button onClick={logout} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:6,padding:"2px 7px",color:T.muted,fontSize:9,cursor:"pointer"}}>Déco</button>
        </div>
      </div>
      <div style={{display:"flex",background:T.card,borderBottom:`1px solid ${T.border}`,overflowX:"auto"}}>
        {tabs.map(t=>(<button key={t.id} onClick={()=>setTab(t.id)} style={{flex:"0 0 auto",minWidth:56,padding:"8px 4px",background:"none",border:"none",cursor:"pointer",borderBottom:tab===t.id?`2px solid ${T.accent}`:"2px solid transparent",color:tab===t.id?T.accent:T.muted,fontSize:8.5,fontWeight:tab===t.id?700:400,display:"flex",flexDirection:"column",alignItems:"center",gap:2,transition:"all .2s"}}><span style={{fontSize:14}}>{t.icon}</span>{t.label}</button>))}
      </div>
      <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
        {tab==="home"    && <HomeTab    orgId={orgId} user={user} plan={plan} onUpgrade={()=>{}}/>}
        {tab==="docs"    && <DocsTab    orgId={orgId} user={user} plan={plan} notify={notify} onUpgrade={()=>{}}/>}
        {tab==="clients" && <ClientsTab orgId={orgId} user={user} notify={notify}/>}
        {tab==="stocks"  && <StocksTab  orgId={orgId} user={user} notify={notify}/>}
        {tab==="rh"      && <RHTab      orgId={orgId} user={user} notify={notify}/>}
        {tab==="compta"  && <ComptaTab  orgId={orgId} user={user} notify={notify}/>}
        {tab==="chat"    && <ChatTab    user={user} plan={plan} notify={notify} onUpgrade={()=>{}}/>}
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
    <div style={{flex:1,overflowY:"auto",padding:13}}>
      <div style={{marginBottom:12}}>
        <div style={{fontSize:15,fontWeight:800}}>Tableau de bord</div>
        <div style={{fontSize:10,color:T.muted}}>{today()} · {user.entreprise||"IMEDIA"} · OHADA</div>
      </div>

      {/* KPIs de base */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
        <KPI icon="💰" label="CA Facturé"  value={`${fmtM(totalCA)}F`}          sub={`${nbFactures} factures`}              color={T.green}/>
        <KPI icon="📋" label="Devis émis"  value={`${fmtM(totalDevis)}F`}        sub={`${nbDevis} devis`}                    color={T.accent}/>
        <KPI icon="📈" label={resultat>=0?"Bénéfice":"Déficit"} value={`${fmtM(Math.abs(resultat))}F`} sub="Produits - Charges" color={resultat>=0?T.green:T.red}/>
        <KPI icon="🏦" label="Trésorerie"  value={`${fmtM(Math.abs(encaiss))}F`} sub={encaiss>=0?"Positive":"Négative"}      color={encaiss>=0?T.green:T.red}/>
      </div>

      {/* ── KPIs AVANCÉS (Option A) ── */}
      <div style={{fontSize:11,fontWeight:700,color:T.accent,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
        📊 Indicateurs avancés
        <span style={{fontSize:9,color:T.muted,fontWeight:400}}>Calculés automatiquement</span>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginBottom:10}}>
        <Card style={{padding:11,background:T.card2,border:`1px solid ${T.cyan}22`}}>
          <div style={{fontSize:18,marginBottom:3}}>🎯</div>
          <div style={{fontSize:16,fontWeight:800,color:T.cyan}}>{tauxConversion}%</div>
          <div style={{fontSize:10,fontWeight:700,color:T.text}}>Taux conversion</div>
          <div style={{fontSize:8,color:T.muted}}>Devis → Facture</div>
          <div style={{background:T.border,borderRadius:10,height:3,marginTop:5}}>
            <div style={{height:"100%",width:`${tauxConversion}%`,background:tauxConversion>=50?T.green:tauxConversion>=25?T.accent:T.red,borderRadius:10}}/>
          </div>
        </Card>
        <Card style={{padding:11,background:T.card2,border:`1px solid ${T.orange}22`}}>
          <div style={{fontSize:18,marginBottom:3}}>⚖️</div>
          <div style={{fontSize:14,fontWeight:800,color:T.orange}}>{pointMort>0?`${fmtM(pointMort)}F`:"N/A"}</div>
          <div style={{fontSize:10,fontWeight:700,color:T.text}}>Point mort/mois</div>
          <div style={{fontSize:8,color:T.muted}}>CA min. pour équilibrer</div>
          {pointMort>0&&totalCA>0&&<div style={{fontSize:8,color:pointMort<=totalCA/6?T.green:T.red,marginTop:2}}>{pointMort<=totalCA/6?"✓ Atteint":"⚠ Non atteint"}</div>}
        </Card>
        <Card style={{padding:11,background:T.card2,border:`1px solid ${T.purple}22`}}>
          <div style={{fontSize:18,marginBottom:3}}>👥</div>
          <div style={{fontSize:14,fontWeight:800,color:T.purple}}>{fmtM(masseSalariale)}F</div>
          <div style={{fontSize:10,fontWeight:700,color:T.text}}>Masse salariale</div>
          <div style={{fontSize:8,color:T.muted}}>{employes.length} employé(s)</div>
        </Card>
      </div>

      {/* Prévision trésorerie */}
      <Card style={{marginBottom:10,padding:13}}>
        <div style={{fontSize:11,fontWeight:700,marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
          🔮 Prévision trésorerie
          <span style={{fontSize:9,color:T.muted,fontWeight:400}}>30 · 60 · 90 jours</span>
        </div>
        {totalCA===0?(
          <div style={{textAlign:"center",padding:"12px 0",color:T.muted,fontSize:11}}>Ajoutez des factures et écritures pour voir les prévisions</div>
        ):(
          <>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:7,marginBottom:10}}>
              {prevData.map(d=>(
                <div key={d.m} style={{textAlign:"center",padding:"8px 6px",background:T.card2,borderRadius:8,border:`1px solid ${d.color}22`}}>
                  <div style={{fontSize:9,color:T.muted,marginBottom:3}}>{d.m}</div>
                  <div style={{fontSize:12,fontWeight:800,color:d.color}}>{fmtM(Math.abs(d.v))}F</div>
                  <div style={{fontSize:8,color:d.v>=0?T.green:T.red}}>{d.v>=0?"▲":"▼"}</div>
                </div>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={80}>
              <AreaChart data={prevData}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border}/>
                <XAxis dataKey="m" tick={{fill:T.muted,fontSize:9}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:T.muted,fontSize:8}} axisLine={false} tickLine={false} tickFormatter={v=>`${fmtM(v)}F`}/>
                <Tooltip contentStyle={{background:T.card,border:`1px solid ${T.border}`,borderRadius:8,fontSize:10}} formatter={v=>`${fmtN(v)} FCFA`}/>
                <Area type="monotone" dataKey="v" stroke={T.accent} fill={T.accentG} strokeWidth={2} name="Trésorerie"/>
              </AreaChart>
            </ResponsiveContainer>
          </>
        )}
      </Card>

      {/* Alertes stocks */}
      {stocksAlerte.length>0&&(
        <Card style={{marginBottom:10,padding:12,border:`1px solid ${T.red}33`}}>
          <div style={{fontSize:11,fontWeight:700,color:T.red,marginBottom:8}}>🚨 Alertes stocks ({stocksAlerte.length})</div>
          {stocksAlerte.slice(0,3).map(s=>(
            <div key={s.id} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${T.border}`,fontSize:11}}>
              <span style={{color:T.text}}>{s.nom}</span>
              <span style={{color:T.red,fontWeight:700}}>{s.quantite} {s.unite} — Seuil: {s.seuilAlerte}</span>
            </div>
          ))}
        </Card>
      )}

      {/* Graphique docs */}
      {typeData.length>0&&(
        <Card style={{marginBottom:10,padding:12}}>
          <div style={{fontSize:11,fontWeight:700,marginBottom:8}}>📄 Documents par type</div>
          <ResponsiveContainer width="100%" height={80}>
            <BarChart data={typeData}>
              <XAxis dataKey="name" tick={{fill:T.muted,fontSize:9}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:T.muted,fontSize:9}} axisLine={false} tickLine={false} allowDecimals={false}/>
              <Tooltip contentStyle={{background:T.card,border:`1px solid ${T.border}`,borderRadius:8,fontSize:11}} cursor={{fill:T.light}}/>
              <Bar dataKey="val" name="Nombre" radius={[4,4,0,0]}>{typeData.map((d,i)=><Cell key={i} fill={d.fill}/>)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Disclaimer rappel */}
      <Card style={{padding:10,border:`1px solid ${T.accent}18`}}>
        <div style={{fontSize:9,color:T.muted,lineHeight:1.6}}>
          ⚠️ <b style={{color:T.accent}}>Rappel légal</b> : Documents indicatifs — faites valider par des professionnels qualifiés. Stockage : {Store.size()} KB / 5 000 KB
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
    saveM([{...mvtForm,id:newId("MVT"),produitNom:prod.nom,ancienStock:Number(prod.quantite),nouveauStock:newQty},...mouvts]);
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
    <div style={{flex:1,overflowY:"auto",padding:13}}>
      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginBottom:11}}>
        <KPI icon="📦" label="Produits"      value={stocks.length}              color={T.blue}/>
        <KPI icon="💰" label="Valeur stock"  value={`${fmtM(valeurStock)}F`}   color={T.green} sub="Au prix d'achat"/>
        <KPI icon="🚨" label="Alertes"       value={stocksAlerte.length}        color={stocksAlerte.length>0?T.red:T.green} sub="Seuil critique"/>
      </div>

      {/* Nav */}
      <div style={{display:"flex",gap:6,marginBottom:11,alignItems:"center"}}>
        {[["liste","📦 Stock"],["mouvements","↕️ Mouvements"],["form",editId?"✏️ Modifier":"➕ Nouveau"]].map(([v,l])=>(
          <button key={v} onClick={()=>{setView(v);if(v==="liste"){setEditId(null);setForm({nom:"",categorie:"",quantite:"",unite:"unité",prixAchat:"",prixVente:"",seuilAlerte:"",fournisseur:""});setErrors({});}}} style={{background:view===v?T.accent:T.light,border:"none",borderRadius:6,padding:"4px 10px",color:view===v?"#000":T.muted,fontSize:10,cursor:"pointer",fontWeight:view===v?700:400,fontFamily:"inherit"}}>{l}</button>
        ))}
      </div>

      {/* Alertes */}
      {stocksAlerte.length>0&&view==="liste"&&(
        <Card style={{marginBottom:10,padding:11,border:`1px solid ${T.red}33`}}>
          <div style={{fontSize:10,fontWeight:700,color:T.red,marginBottom:6}}>🚨 Stock critique ({stocksAlerte.length} produit{stocksAlerte.length>1?"s":""})</div>
          {stocksAlerte.map(s=>(
            <div key={s.id} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"3px 0",borderBottom:`1px solid ${T.border}`}}>
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
            style={{width:"100%",background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 11px",color:T.text,fontSize:12,outline:"none",fontFamily:"inherit",marginBottom:9,boxSizing:"border-box"}}/>
          {paginated.length===0?(
            <div style={{textAlign:"center",padding:"28px 0",color:T.muted}}><div style={{fontSize:28,marginBottom:8}}>📦</div><div style={{fontSize:12}}>{search?"Aucun résultat":"Aucun produit en stock — ajoutez-en !"}</div></div>
          ):paginated.map(p=>{
            const alerte=Number(p.quantite||0)<=Number(p.seuilAlerte||0)&&Number(p.seuilAlerte||0)>0;
            return(
              <Card key={p.id} style={{marginBottom:8,padding:12,border:`1px solid ${alerte?T.red+"44":T.border}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                      <span style={{fontWeight:700,fontSize:13}}>{p.nom}</span>
                      {alerte&&<Badge label="⚠ Stock bas" color={T.red}/>}
                      {p.categorie&&<Badge label={p.categorie} color={T.blue}/>}
                    </div>
                    <div style={{fontSize:11,color:T.muted}}>{p.fournisseur&&`Fourn: ${p.fournisseur} · `}Seuil: {p.seuilAlerte||"—"} {p.unite}</div>
                    {p.prixVente&&<div style={{fontSize:11,color:T.green,marginTop:2}}>Vente: {fmtN(p.prixVente)} FCFA/{p.unite}</div>}
                  </div>
                  <div style={{textAlign:"right",marginLeft:8}}>
                    <div style={{fontSize:18,fontWeight:900,color:alerte?T.red:T.text}}>{fmtN(p.quantite)}</div>
                    <div style={{fontSize:10,color:T.muted}}>{p.unite}</div>
                    <div style={{fontSize:10,color:T.accent,marginTop:2}}>{fmtM(Number(p.quantite||0)*Number(p.prixAchat||0))} F</div>
                  </div>
                </div>
                <div style={{display:"flex",gap:6,marginTop:8}}>
                  <button onClick={()=>{setEditId(p.id);setForm({nom:p.nom,categorie:p.categorie||"",quantite:p.quantite||"",unite:p.unite||"unité",prixAchat:p.prixAchat||"",prixVente:p.prixVente||"",seuilAlerte:p.seuilAlerte||"",fournisseur:p.fournisseur||""});setView("form");}} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:6,padding:"3px 9px",color:T.blue,cursor:"pointer",fontSize:11,fontFamily:"inherit"}}>✏️ Modifier</button>
                  <button onClick={()=>{setMvtForm({...mvtForm,produitId:p.id});setView("mouvements");}} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:6,padding:"3px 9px",color:T.green,cursor:"pointer",fontSize:11,fontFamily:"inherit"}}>↕️ Mouvement</button>
                  <button onClick={()=>delProd(p.id)} style={{background:"none",border:"none",color:T.red,cursor:"pointer",fontSize:13,marginLeft:"auto"}}>🗑</button>
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
          <Card style={{marginBottom:11,padding:13}}>
            <div style={{fontWeight:700,marginBottom:10,fontSize:13}}>Enregistrer un mouvement</div>
            <Sel label="Produit" value={mvtForm.produitId} onChange={v=>{setMvtForm({...mvtForm,produitId:v});setMvtErr(p=>({...p,produit:""}));}} required options={[{value:"",label:"-- Sélectionner --"},...stocks.map(s=>({value:s.id,label:`${s.nom} (${s.quantite} ${s.unite})`}))]}/>
            {mvtErr.produit&&<div style={{fontSize:10,color:T.red,marginTop:-7,marginBottom:7}}>⚠ {mvtErr.produit}</div>}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <Sel label="Type" value={mvtForm.type} onChange={v=>setMvtForm({...mvtForm,type:v})} options={[{value:"entree",label:"📥 Entrée (achat/retour)"},{value:"sortie",label:"📤 Sortie (vente/usage)"}]}/>
              <Inp label="Quantité" value={mvtForm.quantite} onChange={v=>{setMvtForm({...mvtForm,quantite:v});setMvtErr(p=>({...p,quantite:""}));}} placeholder="0" required error={mvtErr.quantite}/>
            </div>
            <Inp label="Motif" value={mvtForm.motif} onChange={v=>setMvtForm({...mvtForm,motif:v})} placeholder="Ex: Vente client, Achat fournisseur..."/>
            <Inp label="Date" value={mvtForm.date} onChange={v=>setMvtForm({...mvtForm,date:v})} placeholder={today()}/>
            <Btn onClick={addMvt} full style={{padding:11}}>✓ Enregistrer le mouvement</Btn>
          </Card>
          <div style={{fontSize:11,fontWeight:700,marginBottom:8}}>Historique des mouvements</div>
          {mouvts.slice(0,20).map(m=>(
            <Card key={m.id} style={{marginBottom:7,padding:11}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:12}}>{m.produitNom}</div>
                  <div style={{fontSize:10,color:T.muted}}>{m.date} · {m.motif||"—"}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:13,fontWeight:800,color:m.type==="entree"?T.green:T.red}}>
                    {m.type==="entree"?"+":"-"}{m.quantite}
                  </div>
                  <div style={{fontSize:9,color:T.muted}}>{m.ancienStock}→{m.nouveauStock}</div>
                </div>
              </div>
            </Card>
          ))}
          {mouvts.length===0&&<div style={{textAlign:"center",padding:"20px 0",color:T.muted,fontSize:12}}>Aucun mouvement enregistré</div>}
        </>
      )}

      {/* FORM */}
      {view==="form"&&(
        <Card style={{padding:14}}>
          <div style={{fontWeight:700,marginBottom:12,fontSize:13}}>{editId?"Modifier":"Nouveau"} produit</div>
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
    saveF([fiche,...fiches.filter(f=>!(f.employeId===emp.id&&f.mois===paieMonth))]);
    notify(`✅ Fiche de paie générée — ${emp.nom} — Net: ${fmtN(paie.net)} FCFA`);
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
    <div style={{flex:1,overflowY:"auto",padding:13}}>
      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginBottom:11}}>
        <KPI icon="👔" label="Effectif"          value={employes.length}            color={T.blue}/>
        <KPI icon="💸" label="Masse salariale"   value={`${fmtM(masseSalariale)}F`} color={T.accent} sub="Brut/mois"/>
        <KPI icon="🏭" label="Coût total patron" value={`${fmtM(coutTotal)}F`}      color={T.red}   sub="Avec CNPS patronal"/>
      </div>

      {/* Nav */}
      <div style={{display:"flex",gap:5,marginBottom:11,flexWrap:"wrap"}}>
        {[["liste","👔 Employés"],["form",editId?"✏️ Modifier":"➕ Nouveau"],["paie","💸 Paie"],["conges","🏖 Congés"]].map(([v,l])=>(
          <button key={v} onClick={()=>{setView(v);if(v==="liste"){setEditId(null);setErrors({});}}} style={{background:view===v?T.accent:T.light,border:"none",borderRadius:6,padding:"4px 10px",color:view===v?"#000":T.muted,fontSize:10,cursor:"pointer",fontWeight:view===v?700:400,fontFamily:"inherit"}}>{l}</button>
        ))}
      </div>

      {/* LISTE EMPLOYÉS */}
      {view==="liste"&&(
        <>
          {paginated.length===0?(
            <div style={{textAlign:"center",padding:"28px 0",color:T.muted}}><div style={{fontSize:28,marginBottom:8}}>👔</div><div style={{fontSize:12}}>Aucun employé — ajoutez votre équipe !</div></div>
          ):paginated.map(emp=>{
            const paie=calculerPaie(emp);
            return(
              <Card key={emp.id} style={{marginBottom:8,padding:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:13}}>{emp.nom}</div>
                    <div style={{fontSize:10,color:T.muted}}>{emp.poste} · {emp.typeContrat}{emp.departement&&` · ${emp.departement}`}</div>
                    {emp.tel&&<div style={{fontSize:10,color:T.muted}}>📞 {emp.tel}</div>}
                    <div style={{fontSize:10,color:T.muted}}>Depuis le {emp.dateEntree}</div>
                  </div>
                  <div style={{textAlign:"right",marginLeft:8}}>
                    <div style={{fontSize:14,fontWeight:800,color:T.green}}>{fmtN(paie.net)}F</div>
                    <div style={{fontSize:9,color:T.muted}}>Net · Brut: {fmtN(emp.salaireBrut)}</div>
                    <div style={{fontSize:9,color:T.red,marginTop:2}}>Coût: {fmtN(paie.coutTotal)}F</div>
                  </div>
                </div>
                <div style={{display:"flex",gap:5,marginTop:8}}>
                  <button onClick={()=>{setEditId(emp.id);setForm({nom:emp.nom,poste:emp.poste,typeContrat:emp.typeContrat||"CDI",salaireBrut:emp.salaireBrut||"",cnps:emp.cnps||"",dateEntree:emp.dateEntree||today(),tel:emp.tel||"",email:emp.email||"",departement:emp.departement||"",congesRestants:emp.congesRestants||"26"});setView("form");}} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:6,padding:"3px 9px",color:T.blue,cursor:"pointer",fontSize:10,fontFamily:"inherit"}}>✏️</button>
                  <button onClick={()=>{genererFichePaie(emp);setView("paie");}} style={{background:"none",border:`1px solid ${T.green}44`,borderRadius:6,padding:"3px 9px",color:T.green,cursor:"pointer",fontSize:10,fontFamily:"inherit"}}>💸 Paie</button>
                  <button onClick={()=>delEmp(emp.id)} style={{background:"none",border:"none",color:T.red,cursor:"pointer",fontSize:13,marginLeft:"auto"}}>🗑</button>
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
          <div style={{fontWeight:700,marginBottom:12,fontSize:13}}>{editId?"Modifier":"Nouvel"} employé</div>
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
              <div style={{background:T.green+"12",border:`1px solid ${T.green}33`,borderRadius:8,padding:12,marginBottom:10}}>
                <div style={{fontSize:10,fontWeight:700,color:T.green,marginBottom:6}}>📊 Simulation paie (CI)</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,fontSize:10}}>
                  {[["Brut",fmtN(p.brut)+" F",T.text],["CNPS salarié (6.3%)","-"+fmtN(p.cnpsSalarie)+" F",T.red],["ITS","-"+fmtN(p.its)+" F",T.red],["NET à payer",fmtN(p.net)+" F",T.green],["CNPS patronal (14.175%)",""+fmtN(p.cnpsPatronal)+" F",T.orange],["Coût total employeur",fmtN(p.coutTotal)+" F",T.red]].map(([l,v,c])=>(
                    <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"2px 0",borderBottom:`1px solid ${T.border}`}}>
                      <span style={{color:T.muted}}>{l}</span><span style={{fontWeight:700,color:c}}>{v}</span>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:9,color:T.muted,marginTop:6}}>⚠️ Calcul indicatif. Taux CI 2026 : CNPS salarié 6.3%, CNPS patronal 14.175%, ITS barème progressif.</div>
              </div>
            );
          })()}

          <div style={{display:"flex",gap:7}}><Btn onClick={addEmp} full>Enregistrer</Btn><Btn variant="ghost" onClick={()=>{setView("liste");setEditId(null);setErrors({});}}>Annuler</Btn></div>
        </Card>
      )}

      {/* PAIE */}
      {view==="paie"&&(
        <>
          <Card style={{marginBottom:11,padding:13}}>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <div>
                <div style={{fontSize:10,color:T.muted,marginBottom:3,textTransform:"uppercase",letterSpacing:".5px"}}>Mois de paie</div>
                <input type="month" value={paieMonth} onChange={e=>setPaieMonth(e.target.value)}
                  style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 11px",color:T.text,fontSize:12,outline:"none",fontFamily:"inherit"}}/>
              </div>
              <Btn onClick={genererTous} style={{marginTop:14}} disabled={employes.length===0}>
                💸 Générer {employes.length} fiche{employes.length>1?"s":""}
              </Btn>
            </div>
          </Card>
          <div style={{fontSize:11,fontWeight:700,marginBottom:8}}>
            Fiches de paie — {paieMonth} ({moisFiches.length} générée{moisFiches.length>1?"s":""})
          </div>
          {moisFiches.length===0?(
            <div style={{textAlign:"center",padding:"20px 0",color:T.muted,fontSize:12}}>Aucune fiche pour ce mois — cliquez "Générer"</div>
          ):moisFiches.map(f=>(
            <Card key={f.id} style={{marginBottom:8,padding:13}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div>
                  <div style={{fontWeight:800,fontSize:13}}>{f.employeNom}</div>
                  <div style={{fontSize:10,color:T.muted}}>{f.poste} · {f.mois}</div>
                </div>
                <Badge label="✅ Générée" color={T.green}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,fontSize:10}}>
                {[["Salaire brut",fmtN(f.brut)+" F",T.text],["CNPS salarié","-"+fmtN(f.cnpsSalarie)+" F",T.red],["ITS","-"+fmtN(f.its)+" F",T.red],["SALAIRE NET",fmtN(f.net)+" F",T.green]].map(([l,v,c])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",borderBottom:`1px solid ${T.border}`}}>
                    <span style={{color:T.muted}}>{l}</span><span style={{fontWeight:700,color:c}}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{marginTop:8,fontSize:10,color:T.orange}}>Charge patronale CNPS: {fmtN(f.cnpsPatronal)} F · Coût total: {fmtN(f.coutTotal)} F</div>
            </Card>
          ))}
          {moisFiches.length>0&&(
            <Card style={{padding:11,border:`1px solid ${T.accent}33`,marginTop:4}}>
              <div style={{fontSize:11,fontWeight:700,color:T.accent,marginBottom:4}}>📊 Récapitulatif {paieMonth}</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,fontSize:11}}>
                {[["Total nets versés",fmtN(moisFiches.reduce((s,f)=>s+f.net,0))+" F",T.green],
                  ["Total CNPS salarié",fmtN(moisFiches.reduce((s,f)=>s+f.cnpsSalarie,0))+" F",T.red],
                  ["Total ITS (DGI)",fmtN(moisFiches.reduce((s,f)=>s+f.its,0))+" F",T.red],
                  ["Total CNPS patronal",fmtN(moisFiches.reduce((s,f)=>s+f.cnpsPatronal,0))+" F",T.orange],
                  ["Coût total employeur",fmtN(moisFiches.reduce((s,f)=>s+f.coutTotal,0))+" F",T.red],
                ].map(([l,v,c])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",borderBottom:`1px solid ${T.border}`}}>
                    <span style={{color:T.muted,fontSize:10}}>{l}</span><span style={{fontWeight:700,color:c}}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{fontSize:9,color:T.muted,marginTop:7}}>⚠️ Fiches indicatives. Faites valider par un expert-comptable agréé avant versement et déclaration CNPS/DGI.</div>
            </Card>
          )}
        </>
      )}

      {/* CONGÉS */}
      {view==="conges"&&(
        <>
          <div style={{fontSize:11,fontWeight:700,marginBottom:8}}>🏖 Suivi des congés</div>
          {employes.length===0?(
            <div style={{textAlign:"center",padding:"20px 0",color:T.muted,fontSize:12}}>Ajoutez des employés pour gérer leurs congés</div>
          ):employes.map(emp=>(
            <Card key={emp.id} style={{marginBottom:8,padding:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:13}}>{emp.nom}</div>
                  <div style={{fontSize:10,color:T.muted}}>{emp.poste}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:18,fontWeight:900,color:Number(emp.congesRestants||26)>10?T.green:T.red}}>{emp.congesRestants||26}</div>
                  <div style={{fontSize:9,color:T.muted}}>jours restants</div>
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
    const prompt=`Génère un ${docType} professionnel N°${num} daté du ${today()} :\nClient: ${form.client} | Service: ${form.service} | Montant: ${fmtN(form.montant)} ${form.devise}\nPrestataire: ${user.entreprise||"INTELLIGENCIA MEDIA (IMEDIA)"}\nConditions: 50% signature, 50% livraison${form.details?" | "+form.details:""}\nNote bas de page: "Document généré par AKILI ERP (IMEDIA) à titre indicatif — à valider par un professionnel qualifié."`;
    try{
      const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,system:SYSTEM,messages:[{role:"user",content:prompt}]})});
      if(!r.ok){const err=await r.json().catch(()=>({}));throw new Error(err.error?.message||`Erreur API (${r.status})`);}
      const d=await r.json();if(d.error) throw new Error(d.error.message);
      const txt=d.content?.[0]?.text||"";if(!txt) throw new Error("Réponse vide");
      setGen(txt);save([{id:num,type:docType,client:form.client,montant:form.montant,devise:form.devise,date:today(),content:txt,owner:user.uid},...docs]);
      notify("✅ Document généré et sauvegardé !");
    }catch(e){setApiErr(e.message||"Erreur de génération.");}
    setLoad(false);
  };
  const del=id=>{save(docs.filter(d=>d.id!==id));notify("Supprimé",T.red);};
  const typeColor=t=>({devis:T.accent,facture:T.green,contrat:T.blue,proposition:T.purple}[t]||T.muted);
  const filtered=docs.filter(d=>(filter==="tous"||d.type===filter)&&(!search||d.client?.toLowerCase().includes(search.toLowerCase())));
  const paginated=filtered.slice(page*PP,(page+1)*PP);

  if(view==="new"&&!docType) return(
    <div style={{flex:1,overflowY:"auto",padding:13}}>
      <div style={{display:"flex",gap:7,marginBottom:14,alignItems:"center"}}><Btn variant="ghost" onClick={()=>setView("list")}>← Retour</Btn><span style={{fontWeight:800,fontSize:14}}>Nouveau document</span></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {[["devis","📋","Devis",T.accent],["facture","🧾","Facture",T.green],["contrat","📝","Contrat",T.blue],["proposition","💼","Proposition",T.purple]].map(([id,ic,lb,col])=>(
          <button key={id} onClick={()=>{setDocType(id);setForm({client:"",service:"",montant:"",details:"",devise:"FCFA"});setErrors({});setApiErr("");}} style={{background:T.card,border:`1px solid ${col}33`,borderRadius:12,padding:18,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:7}}>
            <span style={{fontSize:26}}>{ic}</span><span style={{color:T.text,fontSize:13,fontWeight:700,fontFamily:"inherit"}}>{lb}</span>
          </button>
        ))}
      </div>
    </div>
  );
  if(view==="new"&&docType&&!generated) return(
    <div style={{flex:1,overflowY:"auto",padding:13}}>
      <div style={{display:"flex",gap:7,marginBottom:13,alignItems:"center"}}><Btn variant="ghost" onClick={()=>{setDocType("");setErrors({});}}>←</Btn><span style={{fontWeight:800,fontSize:14}}>Nouveau {docType}</span><span style={{marginLeft:"auto",fontSize:10,color:T.muted}}>⚡{QM.left(user.uid,plan)===999?"∞":QM.left(user.uid,plan)} restants</span></div>
      <Inp label="Client" value={form.client} onChange={v=>{setForm({...form,client:v});setErrors(p=>({...p,client:""}));}} placeholder="Zeleck / Mairie" required error={errors.client}/>
      <Inp label="Service" value={form.service} onChange={v=>{setForm({...form,service:v});setErrors(p=>({...p,service:""}));}} placeholder="Développement site web" required error={errors.service}/>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:8}}>
        <Inp label="Montant" value={form.montant} onChange={v=>{setForm({...form,montant:v});setErrors(p=>({...p,montant:""}));}} placeholder="6000000" required error={errors.montant}/>
        <Sel label="Devise" value={form.devise} onChange={v=>setForm({...form,devise:v})} options={["FCFA","EUR","USD","XOF"]}/>
      </div>
      <Inp label="Détails (optionnel)" value={form.details} onChange={v=>setForm({...form,details:v})} placeholder="Délai, conditions..."/>
      {apiErr&&<div style={{padding:"7px 10px",background:T.red+"15",border:`1px solid ${T.red}33`,borderRadius:7,color:T.red,fontSize:11,marginBottom:10}}>⚠ {apiErr}</div>}
      <Btn onClick={generate} disabled={loading} full style={{padding:12}}>{ loading?"⏳ Génération...":"✨ Générer le "+docType}</Btn>
    </div>
  );
  if(view==="new"&&generated) return(
    <div style={{flex:1,overflowY:"auto",padding:13}}>
      <div style={{display:"flex",gap:7,marginBottom:12,flexWrap:"wrap"}}>
        <Btn variant="ghost" onClick={()=>{setGen("");setDocType("");setView("list");setPage(0);}}>← Liste</Btn>
        <Badge label="✅ Sauvegardé" color={T.green}/>
        <Btn variant="green" sm onClick={()=>{const t=`📄 *${docType.toUpperCase()} N°${docs[0]?.id}*\n👤 ${form.client}\n💰 ${fmtN(form.montant)} ${form.devise}`;window.open(`https://wa.me/?text=${encodeURIComponent(t)}`,"_blank");}} style={{marginLeft:"auto"}}>📲 WhatsApp</Btn>
      </div>
      <Card style={{fontSize:12,lineHeight:1.8,whiteSpace:"pre-wrap"}}>{generated}</Card>
    </div>
  );
  return(
    <div style={{flex:1,overflowY:"auto",padding:13}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <span style={{fontWeight:800,fontSize:14}}>📄 Documents ({docs.length})</span>
        <Btn sm onClick={()=>{setView("new");setDocType("");setGen("");}}>+ Nouveau</Btn>
      </div>
      <input value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} placeholder="🔍 Rechercher..." style={{width:"100%",background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 11px",color:T.text,fontSize:12,outline:"none",fontFamily:"inherit",marginBottom:8,boxSizing:"border-box"}}/>
      <div style={{display:"flex",gap:5,marginBottom:9,overflowX:"auto"}}>
        {["tous","devis","facture","contrat","proposition"].map(f=>(<button key={f} onClick={()=>{setFilter(f);setPage(0);}} style={{background:filter===f?T.accent:T.light,border:"none",borderRadius:16,padding:"3px 10px",color:filter===f?"#000":T.muted,fontSize:10,cursor:"pointer",fontWeight:filter===f?700:400,whiteSpace:"nowrap",fontFamily:"inherit"}}>{f.charAt(0).toUpperCase()+f.slice(1)}</button>))}
      </div>
      {paginated.length===0?(<div style={{textAlign:"center",padding:"28px 0",color:T.muted}}><div style={{fontSize:28,marginBottom:8}}>📄</div><div style={{fontSize:12}}>{search||filter!=="tous"?"Aucun résultat":"Créez votre premier document !"}</div></div>)
      :paginated.map(d=>(<Card key={d.id} style={{marginBottom:7,padding:11}}><div style={{display:"flex",alignItems:"center",gap:7}}><div style={{flex:1}}><div style={{display:"flex",gap:5,alignItems:"center",marginBottom:2}}><Badge label={d.type?.toUpperCase()||"DOC"} color={typeColor(d.type)}/><span style={{fontSize:9,color:T.muted}}>{d.id}</span></div><div style={{fontWeight:700,fontSize:12}}>{d.client}</div><div style={{fontSize:10,color:T.muted}}>{fmtN(d.montant)} {d.devise||"FCFA"} · {d.date}</div></div><button onClick={()=>window.open(`https://wa.me/?text=${encodeURIComponent(`📄 ${d.type?.toUpperCase()} N°${d.id}\n👤 ${d.client}\n💰 ${fmtN(d.montant)} ${d.devise||"FCFA"}`)}`, "_blank")} style={{background:"none",border:"none",fontSize:15,cursor:"pointer"}}>📲</button><button onClick={()=>del(d.id)} style={{background:"none",border:"none",color:T.red,cursor:"pointer",fontSize:13}}>🗑</button></div></Card>))}
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
    <div style={{flex:1,overflowY:"auto",padding:13}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginBottom:10}}>
        {[[clients.length,"Total","👥",T.blue],[clients.filter(c=>c.statut==="Actif").length,"Actifs","✅",T.green],[`${fmtM(totalCA)}F`,"CA FCFA","💰",T.accent]].map(([v,l,i,c])=>(<Card key={l} style={{padding:9,background:T.card2,textAlign:"center"}}><div style={{fontSize:13}}>{i}</div><div style={{fontSize:13,fontWeight:800,color:c}}>{v}</div><div style={{fontSize:9,color:T.muted}}>{l}</div></Card>))}
      </div>
      <div style={{display:"flex",gap:7,marginBottom:9}}>
        <input value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} placeholder="🔍 Rechercher..." style={{flex:1,background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 10px",color:T.text,fontSize:12,outline:"none",fontFamily:"inherit"}}/>
        <Btn sm onClick={()=>{setShow(!showForm);setEditId(null);setForm({nom:"",secteur:"",statut:"Prospect",ca:"",tel:"",email:"",note:""});setErrors({});}}>{showForm?"Fermer":"+ Client"}</Btn>
      </div>
      {showForm&&(<Card style={{marginBottom:10,padding:12}}><div style={{fontWeight:700,marginBottom:9,fontSize:13}}>{editId?"Modifier":"Nouveau"} client</div><Inp label="Nom" value={form.nom} onChange={v=>{setForm({...form,nom:v});setErrors(p=>({...p,nom:""}));}} placeholder="Zeleck" required error={errors.nom}/><Inp label="Secteur" value={form.secteur} onChange={v=>setForm({...form,secteur:v})} placeholder="BTP, Commerce..."/><Inp label="WhatsApp" value={form.tel} onChange={v=>setForm({...form,tel:v})} placeholder="225XXXXXXXX"/><Inp label="CA estimé (FCFA)" value={form.ca} onChange={v=>{setForm({...form,ca:v});setErrors(p=>({...p,ca:""}));}} placeholder="6000000" error={errors.ca}/><Inp label="Note" value={form.note} onChange={v=>setForm({...form,note:v})} placeholder="Notes..."/><Sel label="Statut" value={form.statut} onChange={v=>setForm({...form,statut:v})} options={["Prospect","Actif","Inactif"]}/><div style={{display:"flex",gap:7}}><Btn onClick={add} full>Enregistrer</Btn><Btn variant="ghost" onClick={()=>{setShow(false);setEditId(null);setErrors({});}}>Annuler</Btn></div></Card>)}
      {paginated.map(c=>(<Card key={c.id} style={{marginBottom:7,padding:11}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><div style={{flex:1}}><div style={{fontWeight:700,fontSize:13}}>{c.nom}</div><div style={{fontSize:10,color:T.muted}}>{c.secteur}{c.tel&&` · 📞 ${c.tel}`}</div>{c.note&&<div style={{fontSize:10,color:T.muted,fontStyle:"italic"}}>{c.note}</div>}{c.ca&&<div style={{fontSize:11,fontWeight:700,color:T.accent,marginTop:2}}>{fmtN(c.ca)} F</div>}</div><div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:5}}><Badge label={c.statut} color={sc(c.statut)}/><div style={{display:"flex",gap:4}}>{c.tel&&<button onClick={()=>window.open(`https://wa.me/${c.tel.replace(/\D/g,"")}`, "_blank")} style={{background:"none",border:"none",fontSize:13,cursor:"pointer"}}>📲</button>}<button onClick={()=>edit(c)} style={{background:"none",border:"none",color:T.blue,cursor:"pointer",fontSize:12}}>✏️</button><button onClick={()=>del(c.id)} style={{background:"none",border:"none",color:T.red,cursor:"pointer",fontSize:12}}>🗑</button></div></div></div></Card>))}
      {paginated.length===0&&!showForm&&<div style={{textAlign:"center",padding:"24px 0",color:T.muted}}><div style={{fontSize:28,marginBottom:8}}>👥</div><div style={{fontSize:12}}>{search?"Aucun résultat":"Aucun client"}</div></div>}
      <Pager total={filtered.length} page={page} pp={PP} onPage={setPage}/>
    </div>
  );
}

// ─── COMPTA TAB (compact) ─────────────────────────────────────────
function ComptaTab({orgId,user,notify}){
  const KEY=`akili_ecrit_${orgId}`;
  const [ecritures,setEcrit]=useState(()=>Store.get(KEY,[]));
  const [view,setView]=useState("journal");
  const [showForm,setShow]=useState(false);
  const [page,setPage]=useState(0);
  const PP=15;
  const [form,setForm]=useState({date:today(),libelle:"",compte:"706",debit:"",credit:"",piece:""});
  const [errors,setErrors]=useState({});
  const COMPTES=[{code:"521",lib:"Banque"},{code:"571",lib:"Caisse"},{code:"411",lib:"Clients"},{code:"401",lib:"Fournisseurs"},{code:"601",lib:"Achats"},{code:"621",lib:"Personnel"},{code:"626",lib:"Télécoms"},{code:"631",lib:"Frais bancaires"},{code:"641",lib:"Impôts"},{code:"661",lib:"Charges financières"},{code:"701",lib:"Ventes march."},{code:"706",lib:"Services vendus"},{code:"707",lib:"Produits access."}];
  const save=a=>{setEcrit(a);Store.set(KEY,a);};
  const validate=()=>{const e={};if(!form.libelle.trim())e.libelle="Libellé requis";if(!form.debit&&!form.credit)e.montant="Entrez débit ou crédit";else if(form.debit&&(isNaN(Number(form.debit))||Number(form.debit)<=0))e.montant="Débit invalide";else if(form.credit&&(isNaN(Number(form.credit))||Number(form.credit)<=0))e.montant="Crédit invalide";setErrors(e);return!Object.keys(e).length;};
  const add=()=>{if(!validate())return;save([{...form,id:newId("ECR")},...ecritures]);setForm({date:today(),libelle:"",compte:"706",debit:"",credit:"",piece:""});setErrors({});setShow(false);notify("✅ Écriture OHADA enregistrée");};
  const del=id=>{save(ecritures.filter(e=>e.id!==id));notify("Supprimé",T.red);};
  const totalProd=ecritures.filter(e=>e.compte?.startsWith("7")).reduce((s,e)=>s+Number(e.credit||0),0);
  const totalCh=ecritures.filter(e=>e.compte?.startsWith("6")).reduce((s,e)=>s+Number(e.debit||0),0);
  const resultat=totalProd-totalCh;
  const paginated=ecritures.slice(page*PP,(page+1)*PP);
  return(
    <div style={{flex:1,overflowY:"auto",padding:13}}>
      <div style={{display:"flex",gap:5,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
        {[["journal","📔 Journal"],["resultat","📊 Résultat"],["bilan","⚖️ Bilan"]].map(([v,l])=>(<button key={v} onClick={()=>setView(v)} style={{background:view===v?T.accent:T.light,border:"none",borderRadius:6,padding:"4px 10px",color:view===v?"#000":T.muted,fontSize:10,cursor:"pointer",fontWeight:view===v?700:400,fontFamily:"inherit"}}>{l}</button>))}
        <Btn sm onClick={()=>{setShow(!showForm);setErrors({});}} style={{marginLeft:"auto"}}>{showForm?"Fermer":"+ Écriture"}</Btn>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginBottom:10}}>
        <KPI icon="💚" label="Produits" value={`${fmtM(totalProd)}F`} color={T.green}/>
        <KPI icon="🔴" label="Charges"  value={`${fmtM(totalCh)}F`}  color={T.red}/>
        <KPI icon="📊" label={resultat>=0?"Bénéfice":"Déficit"} value={`${fmtM(Math.abs(resultat))}F`} color={resultat>=0?T.green:T.red}/>
      </div>
      {showForm&&(<Card style={{marginBottom:11,padding:12}}><div style={{fontWeight:700,marginBottom:9,fontSize:13}}>Nouvelle écriture OHADA</div><Inp label="Date" value={form.date} onChange={v=>setForm({...form,date:v})} placeholder={today()}/><Inp label="Libellé" value={form.libelle} onChange={v=>{setForm({...form,libelle:v});setErrors(p=>({...p,libelle:""}));}} placeholder="Ex: Vente services digitaux" required error={errors.libelle}/><Sel label="Compte OHADA" value={form.compte} onChange={v=>setForm({...form,compte:v})} required options={COMPTES.map(c=>({value:c.code,label:`${c.code} — ${c.lib}`}))}/><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}><Inp label="Débit (FCFA)" value={form.debit} onChange={v=>{setForm({...form,debit:v,credit:""});setErrors(p=>({...p,montant:""}));}} placeholder="0"/><Inp label="Crédit (FCFA)" value={form.credit} onChange={v=>{setForm({...form,credit:v,debit:""});setErrors(p=>({...p,montant:""}));}} placeholder="0"/></div>{errors.montant&&<div style={{fontSize:10,color:T.red,marginTop:-6,marginBottom:8}}>⚠ {errors.montant}</div>}<Inp label="N° pièce" value={form.piece} onChange={v=>setForm({...form,piece:v})} placeholder="FAC-2026-001"/><div style={{padding:"6px 9px",background:T.accent+"12",border:`1px solid ${T.accent}22`,borderRadius:7,fontSize:9,color:T.accent,marginBottom:9}}>💡 OHADA : pièce justificative obligatoire. Faites vérifier par un expert-comptable ONECCA-CI.</div><Btn onClick={add} full style={{padding:10}}>✓ Enregistrer</Btn></Card>)}
      {view==="journal"&&(<>{paginated.length===0?(<div style={{textAlign:"center",padding:"22px 0",color:T.muted}}><div style={{fontSize:26,marginBottom:8}}>📒</div><div style={{fontSize:12}}>Aucune écriture</div></div>):paginated.map(e=>(<Card key={e.id} style={{marginBottom:6,padding:10}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><div style={{flex:1}}><div style={{fontWeight:700,fontSize:12}}>{e.libelle}</div><div style={{fontSize:9,color:T.muted}}>{e.date} · Cpt {e.compte}{e.piece&&` · ${e.piece}`}</div></div><div style={{textAlign:"right",marginLeft:8}}>{e.debit&&<div style={{fontSize:11,fontWeight:700,color:T.red}}>D: {fmtN(e.debit)}F</div>}{e.credit&&<div style={{fontSize:11,fontWeight:700,color:T.green}}>C: {fmtN(e.credit)}F</div>}</div><button onClick={()=>del(e.id)} style={{background:"none",border:"none",color:T.red,cursor:"pointer",fontSize:12,marginLeft:5}}>🗑</button></div></Card>))}<Pager total={ecritures.length} page={page} pp={PP} onPage={setPage}/></>)}
      {view==="resultat"&&(<Card style={{padding:13}}><div style={{fontSize:11,fontWeight:700,marginBottom:10,color:T.muted}}>COMPTE DE RÉSULTAT — OHADA</div>{[["Produits d'exploitation (Cl.7)",totalProd,T.green],["Charges d'exploitation (Cl.6)",totalCh,T.red]].map(([l,v,c])=>(<div key={l} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${T.border}`}}><span style={{fontSize:11,color:T.muted}}>{l}</span><span style={{fontWeight:700,color:c,fontSize:12}}>{fmtN(v)} F</span></div>))}<div style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderTop:`2px solid ${T.accent}`,marginTop:3}}><span style={{fontSize:13,fontWeight:800}}>{resultat>=0?"✅ BÉNÉFICE":"❌ DÉFICIT"}</span><span style={{fontSize:15,fontWeight:900,color:resultat>=0?T.green:T.red}}>{fmtN(Math.abs(resultat))} F</span></div>{ecritures.length===0&&<div style={{textAlign:"center",padding:"10px 0",color:T.muted,fontSize:11}}>Ajoutez des écritures pour voir le résultat</div>}<div style={{padding:"7px 9px",background:T.accent+"12",border:`1px solid ${T.accent}22`,borderRadius:7,fontSize:9,color:T.muted,marginTop:8}}>⚠️ Indicatif. Faites certifier par un expert-comptable agréé ONECCA-CI.</div></Card>)}
      {view==="bilan"&&(<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>{[["ACTIF",T.blue,[["521","Banque"],["571","Caisse"],["411","Clients"],["2","Immobilis."]]],["PASSIF",T.red,[["101","Capital"],["130","Résultat"],["401","Fourn."],["447","TVA due"]]]].map(([titre,c,items])=>(<Card key={titre} style={{padding:11}}><div style={{fontSize:11,fontWeight:800,color:c,marginBottom:7}}>{titre}</div>{items.map(([code,lib],i)=>{const val=ecritures.filter(e=>e.compte?.startsWith(code)).reduce((s,e)=>s+Number(e.debit||0)-Number(e.credit||0),0);return(<div key={i} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",borderBottom:`1px solid ${T.border}`,fontSize:9}}><span style={{color:T.muted}}>{code} {lib}</span><span style={{fontWeight:700,color:Math.abs(val)>0?c:T.muted}}>{Math.abs(val)>0?`${fmtN(Math.abs(val))}F`:"—"}</span></div>);})}</Card>))}</div>)}
    </div>
  );
}

// ─── CHAT TAB ─────────────────────────────────────────────────────
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
      const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,system:SYSTEM,messages:next.slice(-20).map(m=>({role:m.role,content:m.content}))})});
      if(!r.ok){const err=await r.json().catch(()=>({}));throw new Error(err.error?.message||`Erreur (${r.status})`);}
      const d=await r.json();if(d.error) throw new Error(d.error.message);
      const txt=d.content?.[0]?.text;if(!txt) throw new Error("Réponse vide");
      saveMsgs([...next,{role:"assistant",content:txt}]);
    }catch(e){setApiErr(e.message);saveMsgs([...next,{role:"assistant",content:`❌ Erreur : ${e.message}`}]);}
    setLoad(false);
  };
  const fmt=t=>t.replace(/\*\*(.*?)\*\*/g,"<b>$1</b>").replace(/\*(.*?)\*/g,"<i>$1</i>").replace(/\n/g,"<br/>");
  const suggestions=["Écriture OHADA pour une vente","TVA 18% Côte d'Ivoire","Calcul CNPS employé","Point mort mon entreprise","Gestion stock saisonnière"];
  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{padding:"5px 12px",background:T.card2,borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:9,color:T.muted}}>🤖 Expert OHADA · Stocks · RH · ⚡{QM.left(user.uid,plan)===999?"∞":QM.left(user.uid,plan)}</span>
        <button onClick={()=>saveMsgs([msgs[0]])} style={{background:"none",border:"none",color:T.red,fontSize:9,cursor:"pointer"}}>🗑 Effacer</button>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:12}}>
        {msgs.map((m,i)=>(<div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start",marginBottom:9}}>{m.role==="assistant"&&<div style={{width:20,height:20,borderRadius:"50%",background:`linear-gradient(135deg,${T.accent},${T.accentD})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,marginRight:5,flexShrink:0,alignSelf:"flex-end"}}>🤖</div>}<div dangerouslySetInnerHTML={{__html:fmt(m.content)}} style={{maxWidth:"82%",padding:"7px 11px",fontSize:11,lineHeight:1.65,borderRadius:m.role==="user"?"13px 13px 3px 13px":"13px 13px 13px 3px",background:m.role==="user"?`linear-gradient(135deg,${T.accent},${T.accentD})`:T.card,border:m.role==="assistant"?`1px solid ${T.border}`:"none",color:m.role==="user"?"#000":T.text}}/></div>))}
        {loading&&<div style={{display:"flex",alignItems:"center",gap:5,marginBottom:9}}><div style={{width:20,height:20,borderRadius:"50%",background:`linear-gradient(135deg,${T.accent},${T.accentD})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9}}>🤖</div><div style={{padding:"7px 11px",background:T.card,border:`1px solid ${T.border}`,borderRadius:"13px 13px 13px 3px",display:"flex",gap:4}}>{[0,1,2].map(i=><div key={i} style={{width:4,height:4,borderRadius:"50%",background:T.accent,animation:`bounce 1.2s infinite`,animationDelay:`${i*.2}s`}}/>)}</div></div>}
        <div ref={endRef}/>
      </div>
      <div style={{padding:"4px 12px",display:"flex",gap:5,overflowX:"auto",background:T.card2,borderTop:`1px solid ${T.border}`}}>
        {suggestions.map(s=>(<button key={s} onClick={()=>setInput(s)} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:14,padding:"3px 9px",color:T.muted,fontSize:9,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"inherit"}}>{s}</button>))}
      </div>
      <div style={{padding:"7px 12px",background:T.card,borderTop:`1px solid ${T.border}`,display:"flex",gap:6}}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()} placeholder="Question OHADA, stocks, RH ou business..."
          style={{flex:1,background:T.bg,border:`1px solid ${T.border}`,borderRadius:18,padding:"7px 13px",color:T.text,fontSize:11,outline:"none",fontFamily:"inherit"}}/>
        <button onClick={send} disabled={loading} style={{width:34,height:34,borderRadius:"50%",background:loading?T.border:`linear-gradient(135deg,${T.accent},${T.accentD})`,border:"none",cursor:loading?"not-allowed":"pointer",fontSize:13}}>➤</button>
      </div>
    </div>
  );
}

const CSS=`
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap');
  *{font-family:'Outfit',sans-serif;box-sizing:border-box;}
  ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#1A2535;border-radius:2px}
  input::placeholder,textarea::placeholder{color:#4D6680}
  select option{background:#0C1219}
  @keyframes bounce{0%,80%,100%{transform:scale(.8);opacity:.5}40%{transform:scale(1.2);opacity:1}}
  @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
`;
