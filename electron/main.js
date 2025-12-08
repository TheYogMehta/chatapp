const { app, BrowserWindow } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({ width: 800, height: 600 });
  win.loadFile(path.join(__dirname, "..", "dist", "index.html")); // <-- matches new webDir
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
