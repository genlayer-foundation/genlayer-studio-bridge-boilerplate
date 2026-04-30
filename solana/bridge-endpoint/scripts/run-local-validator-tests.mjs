import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import net from "node:net";

const PROGRAM_ID = "H4bMLhY9L8rB8kQrMbSeyy2KbQ2CYQnSvxqPro6vsy4J";
const programPath = resolve("target/deploy/bridge_endpoint.so");
const walletPath = resolve("target/test-wallet.json");
const ledgerPath = resolve(".anchor/test-ledger");

if (!existsSync(programPath)) {
  throw new Error(`missing built program: ${programPath}`);
}
if (!existsSync(walletPath)) {
  throw new Error(`missing test wallet: ${walletPath}`);
}

const rpcPort = await findAvailablePort(8899);
const faucetPort = await findAvailablePort(9900);
const validatorPath = findSolanaTestValidator();

const validator = spawn(
  validatorPath,
  [
    "--reset",
    "--quiet",
    "--ledger",
    ledgerPath,
    "--bpf-program",
    PROGRAM_ID,
    programPath,
    "--rpc-port",
    String(rpcPort),
    "--faucet-port",
    String(faucetPort),
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);

validator.stdout.on("data", (data) => process.stdout.write(data));
validator.stderr.on("data", (data) => process.stderr.write(data));

let validatorExited = false;
validator.on("exit", (code, signal) => {
  validatorExited = true;
  if (code !== null && code !== 0) {
    process.stderr.write(`solana-test-validator exited with code ${code}\n`);
  }
  if (signal) {
    process.stderr.write(`solana-test-validator exited with signal ${signal}\n`);
  }
});

try {
  await waitForRpc(`http://127.0.0.1:${rpcPort}`);
  const exitCode = await runTests(rpcPort);
  process.exitCode = exitCode;
} finally {
  if (!validatorExited) {
    validator.kill("SIGTERM");
  }
}

function findSolanaTestValidator() {
  if (process.env.SOLANA_TEST_VALIDATOR && existsSync(process.env.SOLANA_TEST_VALIDATOR)) {
    return process.env.SOLANA_TEST_VALIDATOR;
  }

  const installed = join(
    homedir(),
    ".local/share/solana/install/active_release/bin/solana-test-validator",
  );
  if (existsSync(installed)) {
    return installed;
  }

  return "solana-test-validator";
}

function runTests(port) {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawn(npm, ["run", "test:anchor"], {
    stdio: "inherit",
    env: {
      ...process.env,
      ANCHOR_PROVIDER_URL: `http://127.0.0.1:${port}`,
      ANCHOR_WALLET: walletPath,
    },
  });

  return new Promise((resolvePromise, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => resolvePromise(code ?? 1));
  });
}

async function waitForRpc(url) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getHealth",
        }),
      });
      const body = await response.json();
      if (body.result === "ok") {
        return;
      }
    } catch {
      // Validator is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error(`validator did not become healthy at ${url}`);
}

function findAvailablePort(start) {
  return new Promise((resolvePromise, reject) => {
    const tryPort = (port) => {
      if (port > 65535) {
        reject(new Error(`no available localhost port found from ${start} to 65535`));
        return;
      }

      const server = net.createServer();
      server.unref();
      server.on("error", () => tryPort(port + 1));
      server.listen(port, "127.0.0.1", () => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolvePromise(port);
          }
        });
      });
    };
    tryPort(start);
  });
}
