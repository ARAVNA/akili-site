import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
