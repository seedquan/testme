import { spawn, execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import type { Config } from "../config.js";

const execFile = promisify(execFileCb);

export interface ContainerInfo {
  id: string;
}

export async function createAndStartContainer(
  config: Config
): Promise<ContainerInfo> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY env var required for Claude Code inside Docker"
    );
  }

  const args = [
    "run",
    "-d",
    "--name", `testme-${Date.now()}`,
    "--memory", "4g",
    "--cpus", "2",
    "--pids-limit", "512",
    "-e", `ANTHROPIC_API_KEY=${apiKey}`,
    "-e", "DISPLAY=:99",
    "--label", "testme.run=1",
    "testme-sandbox:latest",
  ];

  const { stdout } = await execFile("docker", args);
  const id = stdout.trim();

  // Verify container is actually running
  await waitForContainer(id);

  // Start Xvfb inside the container
  await execInContainer(id, [
    "bash",
    "-c",
    "Xvfb :99 -screen 0 1280x720x24 &",
  ]);

  // Verify Xvfb started
  await execInContainer(id, [
    "bash",
    "-c",
    "for i in 1 2 3 4 5; do [ -e /tmp/.X11-unix/X99 ] && exit 0; sleep 0.5; done; exit 1",
  ]).catch(() => {
    // Xvfb may work without the socket file on some systems; continue
  });

  return { id };
}

async function waitForContainer(
  containerId: string,
  maxWaitMs = 10_000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const { stdout } = await execFile("docker", [
        "inspect",
        "-f",
        "{{.State.Running}}",
        containerId,
      ]);
      if (stdout.trim() === "true") return;
    } catch {
      // Container not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Container ${containerId.slice(0, 12)} failed to start within ${maxWaitMs}ms`);
}

export async function execInContainer(
  containerId: string,
  cmd: string[],
  options?: { timeout?: number }
): Promise<{ stdout: string; stderr: string }> {
  const timeout = options?.timeout ?? 120_000;
  const { stdout, stderr } = await execFile(
    "docker",
    ["exec", containerId, ...cmd],
    { timeout, maxBuffer: 10 * 1024 * 1024 }
  );
  return { stdout, stderr };
}

export function spawnInContainer(
  containerId: string,
  cmd: string[]
): ReturnType<typeof spawn> {
  return spawn("docker", ["exec", "-i", containerId, ...cmd], {
    stdio: ["pipe", "pipe", "pipe"],
  });
}

export async function stopAndRemove(containerId: string): Promise<void> {
  try {
    await execFile("docker", ["stop", "-t", "5", containerId]);
  } catch {
    // Container may already be stopped
  }
  try {
    await execFile("docker", ["rm", "-f", containerId]);
  } catch {
    // Container may already be removed
  }
}

export async function isDockerAvailable(): Promise<boolean> {
  try {
    await execFile("docker", ["info"]);
    return true;
  } catch {
    return false;
  }
}

export async function imageExists(image: string): Promise<boolean> {
  try {
    await execFile("docker", ["image", "inspect", image]);
    return true;
  } catch {
    return false;
  }
}

export async function buildImage(dockerfilePath: string): Promise<void> {
  const proc = spawn(
    "docker",
    ["build", "-t", "testme-sandbox:latest", "-f", dockerfilePath, "."],
    { cwd: dockerfilePath.replace(/\/[^/]+$/, ""), stdio: "inherit" }
  );

  return new Promise((resolve, reject) => {
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Docker build failed with code ${code}`));
    });
  });
}
