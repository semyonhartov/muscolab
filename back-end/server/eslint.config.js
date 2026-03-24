import globals from 'globals';
import eslint from '@eslint/js';

export default [
  eslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-console': ['warn', { allow: ['error'] }],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
    ignores: ['node_modules/', 'dist/', '.env'],
  },
];
