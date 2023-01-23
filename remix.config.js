/**
 * @type {import('@remix-run/dev').AppConfig}
 */
module.exports = {
  cacheDirectory: "./node_modules/.cache/remix",
  ignoredRouteFiles: [
    ".*",
    "**/*.css",
    "**/*.test.{js,jsx,ts,tsx}",
    "README.md",
  ],
  serverDependenciesToBundle: [
    "d3-scale",
    "d3-array",
    "d3-time",
    "d3-interpolate",
    "d3-format",
    "d3-time-format",
    "d3-color",
    "internmap",
    "d3-shape",
    "d3-path",
  ],
};
