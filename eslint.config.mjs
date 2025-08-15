import typescriptEslint from '@typescript-eslint/eslint-plugin'
import typescriptParser from '@typescript-eslint/parser'
import prettier from 'eslint-config-prettier'

export default [
  {
    ignores: ['build', 'semantic', 'packages', 'tmp']
  },

  prettier,

  {
    files: ['**/*.ts', '**/*.tsx'], // Apply TypeScript-specific configuration
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: {
        $: 'readonly',
        inkdrop: 'readonly',
        app: 'readonly',
        _settings: 'readonly',
        _DEMO_MAX_NOTE_COUNT: 'readonly',
        BROWSER: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        Image: 'readonly',
        btoa: 'readonly',
        alert: 'readonly',
        emit: 'readonly',
        __noteStatus__: 'readonly',
        __noteIndexDocPrefix__: 'readonly',
        __tagIndexDocPrefix__: 'readonly',
        __bookIndexDocPrefix__: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': typescriptEslint
    },
    rules: {
      // TypeScript rules
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }
      ],

      // JavaScript
      'no-useless-escape': 0,
      'prefer-const': 2,
      'no-unused-vars': 0
    }
  }
]
