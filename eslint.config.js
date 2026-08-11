import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

export default [
    {
        ignores: ['dist/', 'node_modules/', 'assets/', '**/*.py', 'fix-sw.js', '*.json'],
    },
    {
        files: ['**/*.js', '**/*.mjs'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                chrome: 'readonly',
            },
        },
        rules: {
            'no-unused-vars': ['warn', { args: 'none' }],
            'no-undef': 'error',
        },
    },
    ...svelte.configs['flat/recommended'],
    {
        files: ['**/*.svelte'],
        rules: {
            'svelte/no-reactive-functions': 'off',
            'svelte/no-unused-props': 'warn',
            'svelte/button-has-type': 'warn',
            'svelte/prefer-class-directive': 'warn',
            'svelte/prefer-destructured-store-props': 'warn',
            'svelte/require-stores-init': 'warn',
        },
    },
];
