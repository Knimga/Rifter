// ESLint: catches code that type-checks but has a known bad shape, chiefly React's hook rules (an effect or
// callback using a value it doesn't list as a dependency keeps an old copy of it). Run `npm run lint`.
// Type errors and unused code are tsc's job (npm run build), so the rules duplicating it are off here.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'forge-snapshots', 'node_modules'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // React's hook rules: hooks only at the top level, and effects and callbacks list what they use
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // tsc already reports these (noUnusedLocals / noUnusedParameters)
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
    },
  },
);
