import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // O formulário público manda payload minúsculo; não precisamos do limite padrão inteiro.
    serverActions: { bodySizeLimit: "1mb" },
  },
};

export default nextConfig;
