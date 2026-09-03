/**
 * FILE: apps/mobile/babel.config.js
 * STATUS: COMPLETE - do not modify
 *
 * babel-preset-expo already includes the TypeScript and JSX transforms and the
 * expo-router plugin. Nothing else is needed, and adding module-resolver
 * aliases here is the usual way people break Metro's symlink handling - use
 * metro.config.js for resolution, Babel for syntax.
 */
module.exports = function (api) {
  api.cache(true);
  return { presets: ["babel-preset-expo"] };
};
