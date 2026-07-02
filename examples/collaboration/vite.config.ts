import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import path from 'path';

const monorepoRoot = path.resolve(__dirname, '../..');

async function fetchGitHubStars(): Promise<number | null> {
  try {
    const res = await fetch('https://api.github.com/repos/xcrong/docx-editor');
    const data = await res.json();
    if (typeof data.stargazers_count === 'number') return data.stargazers_count;
  } catch {}
  return null;
}

export default defineConfig(async () => {
  const stars = await fetchGitHubStars();
  return {
    plugins: [react()],
    root: __dirname,
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: [
        // Resolve package imports to source for live development
        // Order matters: more-specific prefixes before less-specific ones
        {
          find: '@xcrong/docx-editor-react',
          replacement: path.join(monorepoRoot, 'packages/react/src/index.ts'),
        },
        {
          find: '@xcrong/docx-editor-i18n',
          replacement: path.join(monorepoRoot, 'packages/i18n/src/index.ts'),
        },
        {
          find: '@xcrong/docx-editor-agents/react',
          replacement: path.join(monorepoRoot, 'packages/agents/src/react.ts'),
        },
        {
          find: '@xcrong/docx-editor-agents/server',
          replacement: path.join(monorepoRoot, 'packages/agents/src/server.ts'),
        },
        {
          find: /^@xcrong\/docx-editor-agents$/,
          replacement: path.join(monorepoRoot, 'packages/agents/src/index.ts'),
        },
        {
          find: '@xcrong/docx-editor-core/headless',
          replacement: path.join(monorepoRoot, 'packages/core/src/headless.ts'),
        },
        {
          find: '@xcrong/docx-editor-core/core-plugins',
          replacement: path.join(monorepoRoot, 'packages/core/src/core-plugins/index.ts'),
        },
        {
          find: '@xcrong/docx-editor-core/mcp',
          replacement: path.join(monorepoRoot, 'packages/core/src/mcp/index.ts'),
        },
        // Wildcard alias for deep core imports (e.g. @xcrong/docx-editor-core/utils/docxInput)
        {
          find: /^@xcrong\/docx-editor-core\/(.+)/,
          replacement: path.join(monorepoRoot, 'packages/core/src/$1'),
        },
        // Exact match for bare @xcrong/docx-editor-core (must come AFTER the prefix match above)
        {
          find: /^@xcrong\/docx-editor-core$/,
          replacement: path.join(monorepoRoot, 'packages/core/src/core.ts'),
        },
        { find: '@', replacement: path.join(monorepoRoot, 'packages/react/src') },
      ],
    },
    css: {
      postcss: {
        plugins: [
          tailwindcss({ config: path.join(monorepoRoot, 'tailwind.config.js') }),
          autoprefixer(),
        ],
      },
    },
    define: {
      __ENABLE_FRAMEWORK_SWITCHER__: JSON.stringify(
        process.env.ENABLE_FRAMEWORK_SWITCHER === 'true'
      ),
      __GITHUB_STARS__: JSON.stringify(stars),
    },
    server: {
      port: 5273,
      open: false,
    },
    build: {
      outDir: 'dist',
    },
  };
});
