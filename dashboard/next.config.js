/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow Google Fonts and external image domains
  images: {
    remotePatterns: [],
  },
  // Ensure CSS is processed correctly
  experimental: {},
};

module.exports = nextConfig;
