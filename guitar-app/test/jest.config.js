const { pathsToModuleNameMapper } = require('ts-jest');
const path = require('path');
const fs = require('fs');
const tsconfigPath = path.join(__dirname, '../tsconfig.json');
const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, ''));
const { compilerOptions } = tsconfig;

module.exports = {
  rootDir: '..',
  preset: 'jest-preset-angular',
  roots: ['<rootDir>/test/'],
  testMatch: ['**/+(*.)+(spec).+(ts)'],
  setupFilesAfterEnv: ['<rootDir>/test/setup-jest.ts'],
  transform: {
    '^.+\\.(ts|mjs|js|html)$': [
      'jest-preset-angular',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
        stringifyContentPathRegex: '\\.(html|svg)$'
      }
    ]
  },
  collectCoverage: true,
  coverageDirectory: './coverage/guitar-app',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/main.ts',
    '!src/**/*.module.ts'
  ],
  coverageReporters: [
    'html',
    'text-summary'
  ],
  reporters: [
    'default'
  ],
  moduleNameMapper: {
    ...pathsToModuleNameMapper(compilerOptions.paths || {}, { prefix: '<rootDir>/src/' }),
    '^@test/(.*)$': '<rootDir>/test/$1',
    '^tone$': '<rootDir>/test/__mocks__/tone.ts'
  },
  transformIgnorePatterns: ['node_modules/(?!.*\\.mjs$)'],
  testEnvironment: 'jsdom'
};
