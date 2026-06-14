// Tells Puppeteer to download/look for Chrome inside the project folder,
// so the browser that gets downloaded during the build is still there at runtime.
// This is the standard fix for running Puppeteer on Render.
const { join } = require("path");

module.exports = {
  cacheDirectory: join(__dirname, ".cache", "puppeteer"),
};
