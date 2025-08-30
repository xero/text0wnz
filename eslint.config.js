import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [{
  ignores: [
    'dist/',
    'docs/',
    'coverage/',
    'node_modules/',
    '**/tests/**',
    '**/*.config.js',
    '**/*.config.ts',
  ]},
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: process.cwd(),
      },
    },
    rules: {
      quotes: ['error', 'single', {avoidEscape: true, allowTemplateLiterals: true}],
      // no space before function parens for anonymous,always for named
      'space-before-function-paren': ['error',
        {anonymous: 'never', named: 'never', asyncArrow: 'never'}],
      // no spaces around =
      'space-infix-ops': ['error', { int32Hint: false }],
      // no spaces inside brackets/braces/parens
      'array-bracket-spacing': ['error', 'never'],
      'object-curly-spacing': ['error', 'never'],
      'object-curly-newline': ['off'],
      // no space before or after arrow
      'arrow-spacing': ['error',
        {before: false, after: false}],
      // golf tabbing is cool
      indent: 'off',
      // no extra whitespace
      'no-trailing-spaces': 'error',
      'space-in-parens': ['error', 'never'],
      'no-mixed-spaces-and-tabs': 'error',
      // allow _ prefixed vars
      'no-unused-vars': 'off', // turn off the base rule for TS files
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // allow shorthand void returns
      '@typescript-eslint/no-confusing-void-expression': 'off',
      // less strict template literals
      '@typescript-eslint/restrict-template-expressions': [
        'error',{
          allowNumber: true,
          allowBoolean: false,
          allowAny: false,
          allowNullish: false,
          allowRegExp: false,
        }],
      //'@typescript-eslint/await-thenable': 'error',
    },
  },
];
