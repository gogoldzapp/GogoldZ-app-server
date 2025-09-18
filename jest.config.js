export default {
  testEnvironment: "node",
  // No transforms needed if you use plain JS/ESM
  transform: {},
  testMatch: ["**/__tests__/**/*.test.js"],
  setupFilesAfterEnv: ["<rootDir>/__tests__/setup-env.js"],
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  coverageProvider: "v8",
};
