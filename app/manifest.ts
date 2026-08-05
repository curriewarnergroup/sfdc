import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'C&W ShopTrack',
    short_name: 'ShopTrack',
    description: 'C&W ShopTrack — Shopfloor time capture',
    start_url: '/kiosk/login',
    display: 'fullscreen',
    display_override: ['fullscreen', 'standalone'],
    background_color: '#111827',
    theme_color: '#111827',
    icons: [
      {
        src: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/ChatGPT%20Image%20Mar%203%2C%202026%2C%2003_41_27%20PM-hC3ntkzEMOxRGfNw6IhG03wBc5EfyC.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/ChatGPT%20Image%20Mar%203%2C%202026%2C%2003_41_27%20PM-hC3ntkzEMOxRGfNw6IhG03wBc5EfyC.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
    ],
  }
}
