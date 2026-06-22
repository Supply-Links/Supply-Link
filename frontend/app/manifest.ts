import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Supply-Link — Decentralized Supply Chain Tracker',
    short_name: 'Supply-Link',
    description: 'Transparent, tamper-proof product tracking powered by Stellar & Soroban.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone'],
    orientation: 'portrait',
    background_color: '#0f0f0f',
    theme_color: '#7c3aed',
    lang: 'en',
    dir: 'ltr',
    categories: ['productivity', 'utilities'],
    prefer_related_applications: false,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      { name: 'Dashboard', url: '/dashboard', description: 'View supply chain dashboard' },
      { name: 'Scan QR', url: '/tracking?scan=1', description: 'Scan a product QR code' },
    ],
    screenshots: [
      {
        src: '/screenshots/desktop.png',
        sizes: '1280x800',
        type: 'image/png',
        form_factor: 'wide',
      },
      {
        src: '/screenshots/mobile.png',
        sizes: '390x844',
        type: 'image/png',
        form_factor: 'narrow',
      },
    ],
  };
}
