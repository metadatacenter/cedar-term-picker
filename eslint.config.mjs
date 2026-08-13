// @ts-check
/**
 * ESLint flat config.
 *
 * `.mjs` rather than `.js` because package.json declares no `type`, so a bare `.js`
 * here would be parsed as CommonJS and these imports would fail.
 *
 * The Angular recommendations are taken whole. CEE switches three of them off —
 * `prefer-inject`, `prefer-standalone`, `prefer-on-push-component-change-detection` —
 * because each names a rewrite of code that predates the idiom. Nothing here predates
 * anything, so the rules stay on and the code is written to them from the start.
 */
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import angular from 'angular-eslint';
import prettierRecommended from 'eslint-plugin-prettier/recommended';

export default tseslint.config(
  {
    ignores: ['dist/**', 'out-tsc/**', 'node_modules/**', '.angular/**'],
  },
  {
    files: ['**/*.ts'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      ...angular.configs.tsRecommended,
      prettierRecommended,
    ],
    processor: angular.processInlineTemplates,
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'prettier/prettier': 'error',
      // A leading underscore marks a binding that an interface, override or callback
      // signature forces us to declare but that the body does not use.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // The component this repository exists to publish is a custom element, whose tag
      // is `cedar-term-picker` by contract with the host page. Every other selector
      // carries the `ctp` prefix angular.json declares.
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: ['ctp', 'cedar'], style: 'kebab-case' },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
  },
  {
    files: ['**/*.mjs', '**/*.js'],
    extends: [js.configs.recommended, prettierRecommended],
    languageOptions: { globals: { ...globals.node } },
  },
);
