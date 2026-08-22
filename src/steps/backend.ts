import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import { runQuiet } from "../utils/exec.js";
import { addDeps, addDevDeps } from "../utils/install.js";
import { withProgress } from "../utils/progress.js";
import { setupPrettier } from "../utils/prettier.js";
import { mergeEnv } from "../utils/env.js";
import type { PackageManager } from "../types.js";

/** Submap binnen het project waarin de backend wordt geïnstalleerd. */
export const BACKEND_DIR = "backend";

/**
 * Standaardpoort van de backend.
 *
 * De poort komt uit .env (PORT), met deze waarde als terugval. Draait er al een
 * ander project, dan kiest de CLI bij het scaffolden 5001 en schrijft hij die
 * in .env - zie utils/ports.ts. Zo werkt hetzelfde project ook in Docker, waar
 * de poort nu eenmaal via de omgeving binnenkomt.
 */
export const BACKEND_PORT = 5000;

export type Backend = "node" | "nestjs" | "none";

/**
 * Vraag 2: welke backend?
 * Node.js + Express (TypeScript) of NestJS (TypeScript). Beide op poort 5000,
 * beide met Prettier volgens de projectsettings.
 */
export async function askBackend(): Promise<Backend> {
  const choice = await p.select({
    message: "Welke backend wil je gebruiken?",
    initialValue: "node" as Backend,
    options: [
      {
        value: "node" as const,
        label: "Node.js + Express (TypeScript)",
        hint: "lichtgewicht",
      },
      {
        value: "nestjs" as const,
        label: "NestJS (TypeScript)",
        hint: "opinionated framework",
      },
      { value: "none" as const, label: "Geen backend" },
    ],
  });

  if (p.isCancel(choice)) {
    p.cancel("Geannuleerd.");
    process.exit(0);
  }

  return choice;
}

/** Genereert de gekozen backend in ./backend. */
export async function scaffoldBackend(
  backend: Backend,
  projectDir: string,
  pm: PackageManager,
  port: number = BACKEND_PORT,
): Promise<void> {
  if (backend === "none") {
    p.log.info("Geen backend gekozen — overgeslagen.");
    return;
  }

  const target = path.join(projectDir, BACKEND_DIR);

  if (backend === "node") {
    p.log.step(`Node.js + Express opzetten in ./${BACKEND_DIR} (poort ${port}) ...`);
    await scaffoldNode(target, pm, port);
    p.log.success(`Node.js-backend + Prettier aangemaakt in ./${BACKEND_DIR}.`);
    return;
  }

  p.log.step(`NestJS opzetten in ./${BACKEND_DIR} (poort ${port}) ...`);
  await scaffoldNest(target, projectDir, pm, port);
  p.log.success(`NestJS-backend + Prettier aangemaakt in ./${BACKEND_DIR}.`);
}

/* ------------------------------------------------------------------ */
/* Node.js + Express                                                   */
/* ------------------------------------------------------------------ */

const nodeServer = (port: number): string => `// Leest .env in. Moet de eerste import blijven - zie src/env.ts.
import './env.js'

import express from 'express'

const app = express()

/** Uit .env, met ${port} als terugval. */
const PORT = Number(process.env.PORT ?? ${port})

app.use(express.json())

app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
})

app.listen(PORT, () => {
    console.log(\`Backend luistert op http://localhost:\${PORT}\`)
})
`;

async function scaffoldNode(target: string, pm: PackageManager, port: number): Promise<void> {
  fs.mkdirSync(path.join(target, "src"), { recursive: true });

  const pkg = {
    name: "backend",
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      dev: "tsx watch src/index.ts",
      build: "tsc",
      start: "node dist/index.js",
    },
  };
  fs.writeFileSync(path.join(target, "package.json"), JSON.stringify(pkg, null, 4) + "\n");

  const tsconfig = {
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      lib: ["ES2022"],
      outDir: "dist",
      rootDir: "src",
      strict: true,
      esModuleInterop: true,
      forceConsistentCasingInFileNames: true,
      skipLibCheck: true,
      resolveJsonModule: true,
    },
    include: ["src"],
  };
  fs.writeFileSync(path.join(target, "tsconfig.json"), JSON.stringify(tsconfig, null, 4) + "\n");
  fs.writeFileSync(path.join(target, "src", "index.ts"), nodeServer(port));
  fs.writeFileSync(path.join(target, "src", "env.ts"), ENV_LOADER);
  writePortEnv(target, port);
  fs.writeFileSync(path.join(target, ".gitignore"), "node_modules/\ndist/\n.env\n");

  await withProgress(
    "Express + TypeScript installeren",
    async (update) => {
      await addDeps(pm, target, ["express@latest"]);
      await addDevDeps(pm, target, [
        "typescript@latest",
        "tsx@latest",
        "@types/express@latest",
        "@types/node@latest",
      ]);

      update("Prettier installeren en formatteren");
      await setupPrettier(pm, target, { tailwind: false });
    },
    30000,
  );
}

/* ------------------------------------------------------------------ */
/* NestJS                                                              */
/* ------------------------------------------------------------------ */

async function scaffoldNest(
  target: string,
  projectDir: string,
  pm: PackageManager,
  port: number,
): Promise<void> {
  await withProgress(
    "NestJS installeren",
    async (update) => {
      await runQuiet(
        "npx",
        [
          "--yes",
          "@nestjs/cli@latest",
          "new",
          BACKEND_DIR,
          "--package-manager",
          pm,
          "--skip-git",
          "--strict",
        ],
        projectDir,
      );

      fs.writeFileSync(path.join(target, "src", "env.ts"), ENV_LOADER);
      patchNestPort(path.join(target, "src", "main.ts"), port);
      writePortEnv(target, port);

      // Nest genereert met --skip-git geen .gitignore.
      const gitignore = path.join(target, ".gitignore");
      if (!fs.existsSync(gitignore)) {
        fs.writeFileSync(gitignore, "node_modules/\ndist/\ncoverage/\n.env\n");
      }

      // Nest levert zijn eigen .prettierrc mee — die vervangen we door de onze.
      update("Prettier installeren en formatteren");
      await setupPrettier(pm, target, { tailwind: false });
    },
    60000,
  );
}

/** Laat Nest luisteren op PORT uit .env, met `port` als terugval. */
function patchNestPort(mainPath: string, port: number): void {
  if (!fs.existsSync(mainPath)) return;

  let src = fs.readFileSync(mainPath, "utf8");
  if (!/await\s+app\.listen\([^)]*\)/.test(src)) return;

  src = src.replace(
    /await\s+app\.listen\([^)]*\)/,
    `await app.listen(Number(process.env.PORT ?? ${port}))`,
  );

  if (!src.includes("./env")) {
    src =
      "// Leest .env in. Moet de eerste import blijven - zie src/env.ts.\n" +
      "import './env'\n\n" +
      src;
  }

  fs.writeFileSync(mainPath, src, "utf8");
}

/**
 * Leest .env in.
 *
 * Moet de EERSTE import van het startbestand blijven: ES-modules evalueren alle
 * imports voordat de code eronder draait, dus process.loadEnvFile() halverwege
 * komt te laat en de app luistert dan op de terugvalpoort.
 *
 * process.loadEnvFile bestaat sinds Node 20.12. Geen dotenv nodig, en ook geen
 * --env-file in het startcommando: die vlag werkt niet in cmd.exe op Windows.
 */
const ENV_LOADER = `try {
    process.loadEnvFile()
} catch {
    // Geen .env aanwezig - dan gelden de terugvalwaarden in de code.
}

// Maakt van dit bestand een module in plaats van een globaal script.
export {}
`;

/** Zet PORT in .env en .env.example. */
function writePortEnv(target: string, port: number): void {
  const block = [
    "# Poort van deze app. In Docker zet compose deze variabele.",
    `PORT=${port}`,
    "",
  ].join("\n");

  mergeEnv(path.join(target, ".env"), block);
  mergeEnv(path.join(target, ".env.example"), block);
}
