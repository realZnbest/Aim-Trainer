module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/strict-type-checked',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'prettier',
  ],
  parserOptions: {
    project: ['./tsconfig.json'],
    ecmaFeatures: { jsx: true },
  },
  settings: { react: { version: 'detect' } },
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'react/react-in-jsx-scope': 'off',
    // React handler shorthand (`onClick={() => store.set(...)}`) is idiomatic;
    // zustand setters intentionally return void.
    '@typescript-eslint/no-confusing-void-expression': 'off',
    // React Three Fiber uses lowercase three.js props (args/attach/position/...).
    'react/no-unknown-property': 'off',
  },
  ignorePatterns: ['dist', 'test-results', 'playwright-report'],
};
