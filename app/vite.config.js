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
        // Supabase se met en cache séparément du code applicatif.
        // recharts n'est PAS listé ici : il est chargé à la demande via
        // React.lazy (src/Graphiques.jsx). Le lister en « manualChunks »
        // le rattachait à l'entrée et le faisait précharger (150 Ko gzip)
        // dès l'écran de connexion.
        manualChunks: {
          react: ["react", "react-dom"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
});
