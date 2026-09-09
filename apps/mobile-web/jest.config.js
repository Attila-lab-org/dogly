// Jest config volutamente minimale (testEnvironment node + babel-jest):
// i test coprono tokens/lib/contracts (logica pura). NON usiamo jest-expo
// perché in SDK 57 expo-modules-core resta annidato sotto expo/node_modules
// (conflitto peer react-native-worklets) e il suo setup non lo risolve.
// I test che toccano moduli nativi devono usare i boundary iniettabili
// (es. UploadQueueDatabase fake in uploadQueue.test.ts).
module.exports = {
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['**/__tests__/**/*.test.(ts|tsx)'],
};
