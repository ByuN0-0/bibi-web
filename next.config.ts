import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp", "tesseract.js"],
  outputFileTracingIncludes: {
    "/api/lol-statics/match-results/recognize": [
      "./node_modules/@tesseract.js-data/eng/**/*",
      "./node_modules/@tesseract.js-data/kor/**/*",
      "./node_modules/tesseract.js-core/**/*",
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ddragon.leagueoflegends.com",
        pathname: "/cdn/**",
      },
    ],
  },
};

export default nextConfig;
