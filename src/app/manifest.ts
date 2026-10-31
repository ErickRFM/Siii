import type {MetadataRoute} from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SII · Sistema Institucional Integral',
    short_name: 'SII',
    description: 'Plataforma institucional de gestión académica universitaria.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#0D0F12',
    theme_color: '#0D0F12',
    orientation: 'portrait-primary',
    icons: [
      {
        src: '/visuals/siii-warm-architecture.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  };
}
