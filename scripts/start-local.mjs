import { spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const configPath = path.join(projectDirectory, "local-dev.config.json");
const mobileEnvironmentPath = path.join(projectDirectory, "apps", "mobile", ".env");
const apiPort = 4000;
const firstMetroPort = 8081;
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const useShell = process.platform === "win32";

function readConfig() {
  let config;
  try {
    config = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (error) {
    throw new Error(`Could not read ${configPath}: ${String(error)}`);
  }

  const laptopIp = typeof config.laptopIp === "string" ? config.laptopIp.trim() : "";
  const octets = laptopIp.split(".");
  const validIp = octets.length === 4 && octets.every((octet) => {
    if (!/^\d{1,3}$/.test(octet)) return false;
    const value = Number(octet);
    return value >= 0 && value <= 255 && String(value) === octet;
  });
  if (!validIp) {
    throw new Error(`Set laptopIp in ${configPath} to the laptop's Wi-Fi IPv4 address, for example 192.168.1.5.`);
  }
  return { laptopIp };
}

function updateMobileEnvironment(laptopIp) {
  writeFileSync(
    mobileEnvironmentPath,
    `EXPO_PUBLIC_API_URL=http://${laptopIp}:${apiPort}\nEXPO_PUBLIC_BUILD_LABEL=dev\n`,
    "utf8",
  );
}

function runSetupStep(label, args) {
  console.log(`\n[setup] ${label}`);
  const result = spawnSync(npmCommand, args, {
    cwd: projectDirectory,
    stdio: "inherit",
    shell: useShell,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}.`);
}

async function swasthyaHealth(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) return false;
    const body = await response.json();
    return body?.ok === true && body?.data?.status === "ok" && body?.data?.database === "up";
  } catch {
    return false;
  }
}

async function waitForApi(child) {
  const localHealthUrl = `http://127.0.0.1:${apiPort}/health`;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await swasthyaHealth(localHealthUrl)) return;
    if (child.exitCode !== null) throw new Error(`The API stopped with exit code ${child.exitCode}.`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`The API did not become healthy at ${localHealthUrl} within 30 seconds.`);
}

function portIsFree(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "0.0.0.0");
  });
}

async function findMetroPort() {
  for (let port = firstMetroPort; port <= firstMetroPort + 9; port += 1) {
    if (await portIsFree(port)) return port;
  }
  throw new Error(`No free Metro port was found from ${firstMetroPort} to ${firstMetroPort + 9}.`);
}

function startNpm(args) {
  return spawn(npmCommand, args, {
    cwd: projectDirectory,
    stdio: "inherit",
    shell: useShell,
  });
}

async function main() {
  const { laptopIp } = readConfig();
  updateMobileEnvironment(laptopIp);
  console.log(`[config] Mobile API URL: http://${laptopIp}:${apiPort}`);

  if (process.argv.includes("--check")) {
    console.log("[config] Configuration is valid. Run: npm run dev:local");
    return;
  }

  runSetupStep("Starting PostgreSQL", ["run", "db:up"]);
  runSetupStep("Applying database migrations", ["run", "db:migrate"]);

  const localHealthUrl = `http://127.0.0.1:${apiPort}/health`;
  let apiChild = null;
  if (await swasthyaHealth(localHealthUrl)) {
    console.log("\n[api] A healthy SwasthyaSetu API is already running; reusing it.");
  } else {
    console.log("\n[api] Starting API...");
    apiChild = startNpm(["run", "dev:api"]);
    await waitForApi(apiChild);
  }

  const phoneHealthUrl = `http://${laptopIp}:${apiPort}/health`;
  if (!(await swasthyaHealth(phoneHealthUrl))) {
    if (apiChild) apiChild.kill();
    throw new Error(`The API is not reachable through ${phoneHealthUrl}. Check the configured IP and Windows Firewall.`);
  }
  console.log(`[api] Healthy at ${phoneHealthUrl}`);

  const metroPort = await findMetroPort();
  console.log(`\n[mobile] Starting Expo at exp://${laptopIp}:${metroPort}`);
  console.log("[mobile] Scan the QR below with Expo Go. Press Ctrl+C once to stop this launcher.\n");
  const expoChild = startNpm(["run", "dev:mobile", "--", "--clear", "--port", String(metroPort)]);

  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    expoChild.kill();
    if (apiChild) apiChild.kill();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  const exitCode = await new Promise((resolve) => {
    expoChild.once("exit", (code) => resolve(code ?? 0));
    expoChild.once("error", (error) => {
      console.error(error);
      resolve(1);
    });
  });
  stop();
  process.exitCode = exitCode;
}

main().catch((error) => {
  console.error(`\n[start-local] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
