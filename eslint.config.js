import js from '@eslint/js'
import typescriptEslint from '@typescript-eslint/eslint-plugin'
import typescriptParser from '@typescript-eslint/parser'
import json from 'eslint-plugin-json'
import prettier from 'eslint-plugin-prettier'
import jest from 'eslint-plugin-jest'
import prettierConfig from 'eslint-config-prettier'
import globals from 'globals'

export default [
  js.configs.recommended,
  prettierConfig,
  {
    ignores: ['**/node_modules/*', '**/dist/*'],
  },
  {
    files: ['src/**/*.{ts,js,json,d.ts}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        sourceType: 'module',
      },
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    plugins: {
      '@typescript-eslint': typescriptEslint,
      json,
      prettier,
      jest,
    },
    rules: {
      'no-process-exit': 'error',
      'no-process-env': 'error',
      'no-console': 'error',
      'prettier/prettier': 'error',
      'object-shorthand': 'error',
      'jest/no-disabled-tests': 'off',
      'no-useless-escape': 'off',
    },
  },
  {
    files: ['**/*.ts'],
    rules: {
      ...typescriptEslint.configs['eslint-recommended'].rules,
      ...typescriptEslint.configs.recommended.rules,
      '@typescript-eslint/member-delimiter-style': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-use-before-define': 'off',
      '@typescript-eslint/no-empty-interface': 'off',
      '@typescript-eslint/ban-ts-ignore': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/camelcase': 'off',
      '@typescript-eslint/no-namespace': 'off',
      'no-inner-declarations': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['**/*.json'],
    ...json.configs.recommended,
  },
]
