const checkEnvVariables = require("./check-env-variables")
const path = require("path")
const {
  crawlerHeaders,
  assertProductionIndexingConfiguration,
} = require("./src/lib/util/site-policy.cjs")

checkEnvVariables()
assertProductionIndexingConfiguration()

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  serverExternalPackages: ["@statsig/statsig-node-core"],
  env: {
    STRAPI_ENDPOINT: process.env.STRAPI_ENDPOINT,
    STRAPI_API_TOKEN: process.env.STRAPI_API_TOKEN,
    ALGOLIA_APPLICATION_ID: process.env.ALGOLIA_APPLICATION_ID,
    ALGOLIA_SEARCH_API_KEY: process.env.ALGOLIA_SEARCH_API_KEY,
    // Stamp ops_alert events with the deploy SHA so alerts are traceable to a
    // build. Falls back to an existing override if set. (CommonJS config.)
    NEXT_PUBLIC_RELEASE_SHA:
      process.env.NEXT_PUBLIC_RELEASE_SHA ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      "",
  },
  reactStrictMode: true,
  experimental: {
    // Strapi Cloud handles normal storefront traffic well but a cold build can
    // otherwise fan 8 static pages out at once, each with several GraphQL
    // reads. Keep prerender pressure bounded so production artifacts contain
    // real CMS content instead of timeout fallbacks.
    staticGenerationMaxConcurrency: 2,
    staticGenerationMinPagesPerWorker: 100,
  },
  productionBrowserSourceMaps: true,
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    dangerouslyAllowSVG: true,
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    qualities: [50, 60, 75, 85, 100],
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
      },
      {
        protocol: "https",
        hostname: "medusa-public-images.s3.eu-west-1.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "medusa-server-testing.s3.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "medusa-server-testing.s3.us-east-1.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "placehold.co",
      },
      {
        protocol: "https",
        hostname: "**.media.strapiapp.com",
      },
    ],
  },
  // Permanent redirects for legacy paths from the old grillerspride.com URL
  // structure. Skipped /us/passover — destination doesn't exist yet (no
  // passover holidays slug). Wholesale destination shipped in #94 so the
  // /us/wholesale legacy alias now redirects. (#79, #94)
  async headers() {
    return crawlerHeaders()
  },
  async redirects() {
    return [
      {
        source: "/us/about",
        destination: "/us/page/about-us",
        permanent: true,
      },
      {
        source: "/us/about-us",
        destination: "/us/page/about-us",
        permanent: true,
      },
      {
        source: "/us/contact",
        destination: "/us/customer-service",
        permanent: true,
      },
      {
        source: "/us/contact-us",
        destination: "/us/customer-service",
        permanent: true,
      },
      {
        source: "/us/privacy-policy",
        destination: "/us/page/privacy-policy",
        permanent: true,
      },
      {
        source: "/us/terms",
        destination: "/us/page/terms-of-use",
        permanent: true,
      },
      {
        source: "/us/terms-of-sale",
        destination: "/us/page/terms-of-sale",
        permanent: true,
      },
      {
        source: "/us/terms-of-use",
        destination: "/us/page/terms-of-use",
        permanent: true,
      },
      {
        source: "/us/wholesale",
        destination: "/us/page/wholesale",
        permanent: true,
      },
      {
        source: "/us/specialty",
        destination: "/us/page/specialty",
        permanent: true,
      },
    ]
  },
  async rewrites() {
    const analyticsEndpoint = process.env.NEXT_PUBLIC_GP_ANALYTICS_ENDPOINT
    if (!analyticsEndpoint) {
      return []
    }

    return [
      {
        source: "/a/:path*",
        destination: `${analyticsEndpoint.replace(/\/$/, "")}/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
