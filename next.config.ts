import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite testar o build de produção em outra pasta sem atrapalhar o `next dev` (NEXT_DIST_DIR=.next-build).
  ...(process.env.NEXT_DIST_DIR && { distDir: process.env.NEXT_DIST_DIR }),
  cacheComponents: true,
  partialPrefetching: true,
  // PGlite carrega arquivos WASM em tempo de execução; não deve passar pelo bundler.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Demonstração pelo túnel da Cloudflare (npm run demo:tunnel): o servidor de desenvolvimento
  // aceita ser acessado por esses endereços.
  allowedDevOrigins: ["*.trycloudflare.com"],
  ...(process.env.NODE_ENV !== "production" && {
    experimental: { serverActions: { allowedOrigins: ["*.trycloudflare.com"] } },
  }),
  // "Categoria" virou "Registro": links antigos continuam funcionando.
  async redirects() {
    return [
      { source: "/categorias", destination: "/registro", permanent: true },
      { source: "/categorias/:path*", destination: "/registro/:path*", permanent: true },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
