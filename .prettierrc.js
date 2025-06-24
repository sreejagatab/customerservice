module.exports = {
  // Basic formatting
  semi: true,
  trailingComma: 'es5',
  singleQuote: true,
  doubleQuote: false,
  printWidth: 80,
  tabWidth: 2,
  useTabs: false,

  // JavaScript/TypeScript specific
  arrowParens: 'avoid',
  bracketSpacing: true,
  bracketSameLine: false,
  quoteProps: 'as-needed',

  // HTML/JSX specific
  htmlWhitespaceSensitivity: 'css',
  jsxSingleQuote: true,
  jsxBracketSameLine: false,

  // Other formats
  endOfLine: 'lf',
  embeddedLanguageFormatting: 'auto',

  // File-specific overrides
  overrides: [
    {
      files: '*.json',
      options: {
        printWidth: 120,
        tabWidth: 2,
      },
    },
    {
      files: '*.md',
      options: {
        printWidth: 100,
        proseWrap: 'always',
      },
    },
    {
      files: '*.yml',
      options: {
        tabWidth: 2,
        singleQuote: false,
      },
    },
    {
      files: '*.yaml',
      options: {
        tabWidth: 2,
        singleQuote: false,
      },
    },
  ],
};
