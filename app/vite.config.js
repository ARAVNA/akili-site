import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  // Vite n'expose au navigateur que les variables préfixées VITE_.
  // Le projet Vercel qui sert akilierp.africavit.com porte déjà, depuis
  // l'application précédente, NEXT_PUBLIC_SUPABASE_URL et
  // NEXT_PUBLIC_SUPABASE_ANON_KEY. Les accepter évite de redemander les
  // mêmes valeurs sous un autre nom — et évite surtout qu'une des deux
  // copies soit un jour mise à jour sans l'autre.
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        // Découpage pensé pour une connexion mobile ivoirienne :
        // les graphiques (recharts) et Supabase ne sont pas nécessaires
        // au premier écran, ils se chargent en parallèle et se mettent
        // en cache séparément — une mise à jour du code applicatif
        // ne force pas à retélécharger ces deux blocs.
        manualChunks: {
          react: ["react", "react-dom"],
          charts: ["recharts"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
});
