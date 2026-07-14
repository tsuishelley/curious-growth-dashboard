/** @type {import('next').NextConfig} */
const nextConfig = {
  // firebase-admin pulls in jwks-rsa -> jose@6, which is ESM-only and breaks
  // when Next.js's bundler tries to inline it into the serverless function
  // (require() of an ES module). Keeping it external leaves it as a normal
  // node_modules require at runtime instead, which works fine.
  // (This is `experimental.serverComponentsExternalPackages` on Next 14 --
  // it moved to a stable top-level `serverExternalPackages` in Next 15.)
  experimental: {
    serverComponentsExternalPackages: ["firebase-admin"],
  },
};

module.exports = nextConfig;
