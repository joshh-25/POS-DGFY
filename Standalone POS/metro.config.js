const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const exclusionList = require('metro-config/src/defaults/exclusionList');

const projectRoot = __dirname;
const hardwarePosRoot = path.resolve(__dirname, '../mobile/hardware-pos');

const config = {
  projectRoot,
  watchFolders: [hardwarePosRoot],
  resolver: {
    disableHierarchicalLookup: true,
    blockList: exclusionList([
      new RegExp('.*\\\\Standalone POS\\\\app\\\\build\\\\.*'),
      new RegExp('.*\\\\Standalone POS\\\\build\\\\.*'),
      new RegExp('.*\\\\mobile\\\\hardware-pos\\\\node_modules\\\\.*')
    ]),
    extraNodeModules: {
      react: path.resolve(projectRoot, 'node_modules/react'),
      'react/jsx-runtime': path.resolve(projectRoot, 'node_modules/react/jsx-runtime.js'),
      'react/jsx-dev-runtime': path.resolve(projectRoot, 'node_modules/react/jsx-dev-runtime.js'),
      'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
      '@react-native/virtualized-lists': path.resolve(projectRoot, 'node_modules/react-native/node_modules/@react-native/virtualized-lists'),
      zustand: path.resolve(projectRoot, 'node_modules/zustand')
    },
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(projectRoot, 'node_modules/react-native/node_modules')
    ]
  }
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
