import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'test-results', 'playwright-report', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: { project: ['./tsconfig.json'], tsconfigRootDir: import.meta.dirname },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // Classic hooks rules only: v7's React-Compiler rules (refs-in-render etc.)
      // conflict with the ref-bundle architecture (D-05) and are not enforced.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // React handler shorthand (`onClick={() => store.set(...)}`) is idiomatic;
      // zustand setters intentionally return void.
      '@typescript-eslint/no-confusing-void-expression': 'off',
    },
  },
  // Non-src files (tests/config/scripts) are not in the type-aware project.
  { files: ['**/*.{js,mjs,cjs,ts}'], ignores: ['src/**'], ...tseslint.configs.disableTypeChecked },
  prettier,
);
