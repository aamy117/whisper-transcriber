import globals from 'globals';
import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        Config: 'readonly',
        process: 'readonly',
        AudioContext: 'readonly',
        webkitAudioContext: 'readonly',
        MediaRecorder: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        Worker: 'readonly',
        indexedDB: 'readonly',
        IDBKeyRange: 'readonly',
        caches: 'readonly',
        clients: 'readonly',
        registration: 'readonly',
        skipWaiting: 'readonly'
      }
    },
    rules: {
      // Prettier handles these, so disable or set to off
      'indent': 'off',
      'quotes': 'off',
      'semi': 'off',
      'no-trailing-spaces': 'off',
      'eol-last': 'off',
      'comma-dangle': 'off',
      'object-curly-spacing': 'off',
      'array-bracket-spacing': 'off',
      'keyword-spacing': 'off',
      'space-before-function-paren': 'off',

      // Keep these as warnings/errors for code quality
      'no-unused-vars': ['warn'],
      'no-console': ['warn'],
      'no-debugger': ['error'],
      'no-undef': ['error']
    }
  },
  {
    ignores: [
      'node_modules/**',
      'models/**',
      'assets/**',
      '_workspace/**',
      'test/**',
      'temp/**',
      '*.min.js'
    ]
  }
];
