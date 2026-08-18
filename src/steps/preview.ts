import path from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { openBrowser, openTerminal } from "../utils/terminal.js";
import { FRONTEND_DIR, FRONTEND_PORT } from "./frontend.js";
import { BACKEND_DIR, BACKEND_PORT } from "./backend.js";
import type { Frontend } from "./frontend.js";
import type { Backend } from "./backend.js";
import type { PackageManager } from "../types.js";

/** Een dev-server die in een eigen terminalvenster gestart wordt. */
interface Server {
  title: string;
  dir: string;
  command: string;
  url: string;
}

/**
 * Vraag 4: preview starten?
 * Wordt alleen gesteld als er iets te draaien valt.
 */
export async function askPreview(frontend: Frontend, backend: Backend): Promise<boolean> {
  if (frontend === "none" && backend === "none") return false;

  const answer = await p.confirm({
    message: "Wil je een preview zien als alles geïnstalleerd is?",
    initialValue: true,
  });
  if (p.isCancel(answer)) {
    p.cancel("Geannuleerd.");
    process.exit(0);
  }

  return answer;
}

/** Bepaalt welke dev-servers er gestart moeten worden. */
function serversFor(frontend: Frontend, backend: Backend, pm: PackageManager): Server[] {
  const servers: Server[] = [];

  if (frontend === "nextjs") {
    servers.push({
      title: "Frontend",
      dir: FRONTEND_DIR,
      command: `${pm} run dev`,
      url: `http://localhost:${FRONTEND_PORT}`,
    });
  }
  if (backend === "node") {
    servers.push({
      title: "Backend",
      dir: BACKEND_DIR,
      command: `${pm} run dev`,
      url: `http://localhost:${BACKEND_PORT}/health`,
    });
  } else if (backend === "nestjs") {
    servers.push({
      title: "Backend",
      dir: BACKEND_DIR,
      command: `${pm} run start:dev`,
      url: `http://localhost:${BACKEND_PORT}`,
    });
  }

  return servers;
}

/**
 * Start elke dev-server in een eigen terminalvenster en opent daarna de
 * frontend in de browser.
 */
export async function startPreview(
  enabled: boolean,
  projectDir: string,
  frontend: Frontend,
  backend: Backend,
  pm: PackageManager,
): Promise<void> {
  if (!enabled) return;

  const servers = serversFor(frontend, backend, pm);
  if (servers.length === 0) return;

  p.log.step(`Preview starten — ${servers.length} terminal(s) ...`);

  const failed: Server[] = [];
  for (const server of servers) {
    const cwd = path.join(projectDir, server.dir);
    const ok = openTerminal(server.title, cwd, server.command);
    if (ok) {
      p.log.info(`${server.title}: ${pc.cyan(server.url)} ${pc.dim(`(${server.dir} — ${server.command})`)}`);
    } else {
      failed.push(server);
    }
  }

  if (failed.length > 0) {
    p.log.warn(
      "Kon geen terminalvenster openen. Start ze zelf:\n" +
        failed.map((s) => `  cd ${s.dir} && ${s.command}   # ${s.url}`).join("\n"),
    );
    return;
  }

  // Even wachten tot de dev-server luistert, dan pas de browser openen.
  const first = servers[0];
  await delay(8000);
  openBrowser(first.url);
  p.log.success(`Browser geopend op ${first.url}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
