module.exports = {
  ci: {
    collect: {
      startServerCommand: 'npm run start',
      url: ['http://localhost:3000/', 'http://localhost:3000/dashboard'],
      numberOfRuns: 1,
    },
    assert: {
      preset: 'lighthouse:recommended',
      assertions: {
        'categories:pwa': ['error', { minScore: 0.9 }],
        'categories:performance': ['warn', { minScore: 0.7 }],
        'categories:accessibility': ['warn', { minScore: 0.9 }],
        'service-worker': ['error', { minScore: 1 }],
        'installable-manifest': ['error', { minScore: 1 }],
        'splash-screen': ['warn', { minScore: 1 }],
        'themed-omnibox': ['warn', { minScore: 1 }],
        'content-width': ['error', { minScore: 1 }],
        'viewport': ['error', { minScore: 1 }],
        'without-javascript': ['warn', { minScore: 1 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
