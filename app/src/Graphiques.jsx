// Graphiques du tableau de bord. Ce fichier est chargé À LA DEMANDE
// (React.lazy dans App.jsx) : la bibliothèque recharts pèse ~150 Ko et
// n'est pas nécessaire à l'écran de connexion ni au premier affichage.
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
         Cell, CartesianGrid, AreaChart, Area } from "recharts";

export function GraphTresorerie({ prevData, T, fmtM, fmtN }) {
  return (
    <ResponsiveContainer width="100%" height={80}>
      <AreaChart data={prevData}>
        <CartesianGrid strokeDasharray="3 3" stroke={T.border}/>
        <XAxis dataKey="m" tick={{fill:T.muted,fontSize:13}} axisLine={false} tickLine={false}/>
        <YAxis tick={{fill:T.muted,fontSize:12}} axisLine={false} tickLine={false} tickFormatter={v=>`${fmtM(v)}F`}/>
        <Tooltip contentStyle={{background:T.card,border:`1px solid ${T.border}`,borderRadius:8,fontSize:14}} formatter={v=>`${fmtN(v)} FCFA`}/>
        <Area type="monotone" dataKey="v" stroke={T.accent} fill={T.accentG} strokeWidth={2} name="Trésorerie"/>
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function GraphTypes({ typeData, T }) {
  return (
    <ResponsiveContainer width="100%" height={80}>
      <BarChart data={typeData}>
        <XAxis dataKey="name" tick={{fill:T.muted,fontSize:13}} axisLine={false} tickLine={false}/>
        <YAxis tick={{fill:T.muted,fontSize:13}} axisLine={false} tickLine={false} allowDecimals={false}/>
        <Tooltip contentStyle={{background:T.card,border:`1px solid ${T.border}`,borderRadius:8,fontSize:15}} cursor={{fill:T.light}}/>
        <Bar dataKey="val" name="Nombre" radius={[4,4,0,0]}>{typeData.map((d,i)=><Cell key={i} fill={d.fill}/>)}</Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
