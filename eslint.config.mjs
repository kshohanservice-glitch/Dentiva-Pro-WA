import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

const hookRules =
  reactHooks.configs?.['recommended-latest']?.rules ??
  reactHooks.configs?.recommended?.rules ?? {
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
  };

export default tseslint.config(
  {
    ignores: ['dist/**', 'dist-electron/**', 'node_modules/**', 'release/**', 'build/**', 'coverage/**', 'release-artifacts/**'],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { ...hookRules, 'react-hooks/exhaustive-deps': 'error' },
  },
);
