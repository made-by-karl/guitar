const { pathsToModuleNameMapper } = require('ts-jest');
const fs = require('fs');
const tsconfig = JSON.parse(fs.readFileSync('./tsconfig.spec.json', 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, ''));
const { compilerOptions } = tsconfig;

module.exports = {
  preset: 'jest-preset-angular',
  roots: ['<rootDir>/src/'],
  testMatch: ['**/+(*.)+(spec).+(ts)'],
  setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
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
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths || {}, {
    prefix: '<rootDir>/'
  }),
  transformIgnorePatterns: ['node_modules/(?!.*\\.mjs$)'],
  testEnvironment: 'jsdom'
};
