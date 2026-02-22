import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';

export default [
  // Apply to all TypeScript source files
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      prettier: prettierPlugin,
    },
    rules: {
      // From eslint:recommended (subset that matters most)
      'no-unused-vars': 'off', // disabled in favour of the TS-aware version below
      'no-undef': 'off',       // TypeScript handles this

      // From @typescript-eslint/recommended
      ...tsPlugin.configs['recommended'].rules,

      // From prettier/recommended
      ...prettierConfig.rules,
      'prettier/prettier': 'error',

      // Project-specific overrides (mirrors old .eslintrc.json)
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
    },
  },
  // Ignore generated and third-party directories
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'orchestrator/ui/client/dist/**',
      'scripts/**',
    ],
  },
];
