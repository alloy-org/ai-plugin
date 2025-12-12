import dotenv from "dotenv"

dotenv.config();

/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  modulePaths: ['<rootDir>/lib'],
  moduleDirectories: ['node_modules', '<rootDir>/lib'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.js$': ['ts-jest', {
      useESM: true,
    }],
  },
};
