// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);
const workspaceRoot = path.resolve(__dirname, '../..');

// The food finder is one shared source for native and mobile-web. Watching the
// workspace prevents the two owner flows from drifting apart.
config.watchFolders = [workspaceRoot];

module.exports = config;
