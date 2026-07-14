/** @type {import('next').NextConfig} */
const nextConfig = {
  // firebase-admin is server-only and pulls in native/dynamic deps that the
  // bundler shouldn't inline -- keep it a plain node_modules require at runtime.
  // (`experimental.serverComponentsExternalPackages` on Next 14; became the
  // stable top-level `serverExternalPackages` in Next 15.)
  experimental: {
    serverComponentsExternalPackages: ["firebase-admin"],
  },
};

module.exports = nextConfig;
