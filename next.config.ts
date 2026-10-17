import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // PGlite carrega arquivos WASM em tempo de execução; não deve passar pelo bundler.
  serverExternalPackages: ["@electric-sql/pglite"],
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
