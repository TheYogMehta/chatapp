// run-sync-and-patch.js
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

try {
  execSync("tsc && vite build", { stdio: "inherit", cwd: process.cwd() });
  execSync("npx cap sync", { stdio: "inherit", cwd: process.cwd() });
  execSync("npx cap sync electron", { stdio: "inherit", cwd: process.cwd() });

  const filePath = path.join(
    process.cwd(),
    "electron/src/rt/electron-plugins.js",
  );

  // only replace the plugin entry, nothing else
  fs.writeFileSync(
    filePath,
    `const path = require("path");

const pluginRelativePath = path.posix.join(
  "..",
  "..",
  "..",
  "node_modules",
  "@capacitor-community",
  "sqlite",
  "electron",
  "dist",
  "plugin.js",
);

const CapacitorCommunitySqlite = require(pluginRelativePath);

module.exports = {
  CapacitorCommunitySqlite: CapacitorCommunitySqlite.default,
};
`,
    "utf8",
  );
  console.log("Updated CapacitorCommunitySqlite export.");
} catch (err) {
  console.error("Error:", err);
}
