
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Prevent webpack from bundling pdf-parse so module.parent is set correctly at runtime
      config.externals = [...(Array.isArray(config.externals) ? config.externals : [config.externals]), 'pdf-parse']
    }
    return config
  },
}

export default nextConfig
