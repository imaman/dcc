module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    sourceType: 'module',
  },
  env: {
    es6: true,
    node: true,
  },
  plugins: ['@typescript-eslint', 'json', 'prettier', 'jest'],
  extends: ['eslint:recommended', 'plugin:json/recommended', 'prettier', 'plugin:jest/recommended'],
  globals: {},
  rules: {
    'no-process-exit': 'error',
    'no-process-env': 'error',
    'no-console': 'error',
    'prettier/prettier': 'error',
    'object-shorthand': 'error',
    'jest/no-disabled-tests': 'off',
    'no-useless-escape': 'off', // rule has false positives
  },
  overrides: [
    {
      files: ['*.ts'],
      extends: ['plugin:@typescript-eslint/eslint-recommended', 'plugin:@typescript-eslint/recommended'],
      rules: {
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
      files: ['*.spec.ts'],
      rules: {
        '@typescript-eslint/no-non-null-assertion': 'off',
      },
    },
  ],
}
