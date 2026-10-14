/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: false,
    cpus: 1,
    outputFileTracingRoot: process.cwd(),
  },
};

export default nextConfig;
