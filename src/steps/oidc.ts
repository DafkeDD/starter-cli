import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import { addDeps, addDevDeps } from "../utils/install.js";
import { withProgress } from "../utils/progress.js";
import { setupPrettier } from "../utils/prettier.js";
import { copyTemplate } from "../utils/template.js";
import { FRONTEND_PORT } from "./frontend.js";
import { BACKEND_DIR, BACKEND_PORT } from "./backend.js";
import type { Backend } from "./backend.js";
import type { PackageManager } from "../types.js";

/** Map voor een nieuwe OIDC-server. */
export const OIDC_DIR = "oidc";

/** Poort van de OIDC-server, naast frontend (3000) en backend (5000). */
export const OIDC_PORT = 9000;

export type OidcMode = "new" | "existing" | "none";

export interface OidcChoice {
  mode: OidcMode;
  /** Alleen bij "existing": de issuer-URL van de bestaande hub. */
  issuer: string;
  /** Alleen bij "existing": is dit project het beheerpaneel? */
  isAdminPanel: boolean;
  /** client_id waarmee dit project zich aanmeldt. */
  clientId: string;
  /** client_secret; bij "new" zelf gegenereerd. */
  clientSecret: string;
}

/**
 * Vraag 4: OIDC / SSO.
 *
 * Bij "aansluiten" volgt de vraag of dit project het beheerpaneel is — dan
 * krijgt het een /admin-scherm met gebruikersbeheer erbij.
 */
export async function askOidc(projectName: string): Promise<OidcChoice> {
  const mode = await p.select({
    message: "OIDC / SSO?",
    initialValue: "none" as OidcMode,
    options: [
      {
        value: "new" as const,
        label: "Nieuwe OIDC-server",
        hint: `deze app wordt de hub — ./${OIDC_DIR} op poort ${OIDC_PORT}`,
      },
      {
        value: "existing" as const,
        label: "Aansluiten op een bestaande server",
        hint: "vraagt de issuer-URL",
      },
      { value: "none" as const, label: "Geen" },
    ],
  });
  if (p.isCancel(mode)) {
    p.cancel("Geannuleerd.");
    process.exit(0);
  }

  const clientId = slug(projectName);

  if (mode === "none") {
    return { mode, issuer: "", isAdminPanel: false, clientId, clientSecret: "" };
  }

  if (mode === "new") {
    return {
      mode,
      issuer: `http://localhost:${OIDC_PORT}`,
      isAdminPanel: false,
      clientId,
      clientSecret: crypto.randomBytes(24).toString("hex"),
    };
  }

  // ---- aansluiten op een bestaande server --------------------------------
  const issuer = await p.text({
    message: "URL van de bestaande OIDC-server?",
    placeholder: `http://localhost:${OIDC_PORT}`,
    defaultValue: `http://localhost:${OIDC_PORT}`,
    validate: (value) => {
      const v = (value ?? "").trim();
      if (!v) return undefined;
      try {
        new URL(v);
        return undefined;
      } catch {
        return "Geen geldige URL (bv. https://login.mijnbedrijf.be).";
      }
    },
  });
  if (p.isCancel(issuer)) {
    p.cancel("Geannuleerd.");
    process.exit(0);
  }

  const role = await p.select({
    message: "Is dit project het beheerpaneel van die server?",
    initialValue: "app" as "app" | "admin",
    options: [
      { value: "app" as const, label: "Nee, gewone app", hint: "login + beschermde routes" },
      {
        value: "admin" as const,
        label: "Ja, dit is het beheerpaneel",
        hint: "krijgt /admin met gebruikersbeheer",
      },
    ],
  });
  if (p.isCancel(role)) {
    p.cancel("Geannuleerd.");
    process.exit(0);
  }

  const secret = await p.text({
    message: "client_secret van deze app? (leeg = later invullen in .env)",
    placeholder: "wordt in backend/.env gezet",
    defaultValue: "",
  });
  if (p.isCancel(secret)) {
    p.cancel("Geannuleerd.");
    process.exit(0);
  }

  return {
    mode: "existing",
    issuer: String(issuer).trim().replace(/\/$/, ""),
    isAdminPanel: role === "admin",
    clientId,
    clientSecret: String(secret).trim(),
  };
}

/** Zet de nieuwe OIDC-server op in ./oidc. */
export async function scaffoldOidcServer(
  choice: OidcChoice,
  projectDir: string,
  projectName: string,
  pm: PackageManager,
): Promise<void> {
  if (choice.mode !== "new") return;

  const target = path.join(projectDir, OIDC_DIR);
  p.log.step(`OIDC-server opzetten in ./${OIDC_DIR} (poort ${OIDC_PORT}) ...`);

  await withProgress(
    "OIDC-server installeren",
    async (update) => {
      copyTemplate("oidc-server", target, {
        OIDC_PORT,
        BACKEND_PORT,
        FRONTEND_PORT,
        PROJECT_NAME: projectName,
        CLIENT_ID: choice.clientId,
        CLIENT_SECRET: choice.clientSecret,
        ACCENT: "#0f9d58",
        TAGLINE: "Centrale login",
      });

      await addDeps(pm, target, [
        "oidc-provider@latest",
        "express@latest",
        "bcryptjs@latest",
        "jose@latest",
      ]);
      await addDevDeps(pm, target, [
        "typescript@latest",
        "tsx@latest",
        "@types/node@latest",
        "@types/express@latest",
        "@types/oidc-provider@latest",
      ]);

      update("Prettier installeren en formatteren");
      await setupPrettier(pm, target, { tailwind: false });
    },
    45000,
  );

  p.log.success(`OIDC-server aangemaakt in ./${OIDC_DIR}.`);
}

/** Maakt van een projectnaam een geldige client_id. */
function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "app"
  );
}

/* ------------------------------------------------------------------ */
/* Client-kant: de backend als OIDC-client                             */
/* ------------------------------------------------------------------ */

/** Zet de OIDC-client op in de backend (Express of NestJS). */
export async function scaffoldOidcClient(
  choice: OidcChoice,
  backend: Backend,
  projectDir: string,
  pm: PackageManager,
): Promise<void> {
  if (choice.mode === "none") return;
  if (backend === "none") {
    p.log.warn("Geen backend gekozen — de OIDC-client-kant wordt overgeslagen.");
    return;
  }

  const target = path.join(projectDir, BACKEND_DIR);
  const vars = {
    ISSUER: choice.issuer,
    CLIENT_ID: choice.clientId,
    CLIENT_SECRET: choice.clientSecret,
    BACKEND_PORT,
    FRONTEND_PORT,
  };

  p.log.step(
    `OIDC-client opzetten in ./${BACKEND_DIR}${choice.isAdminPanel ? " (met beheer-routes)" : ""} ...`,
  );

  await withProgress(
    "OIDC-client installeren",
    async (update) => {
      if (backend === "node") {
        copyTemplate("oidc-client-express", target, vars);
        if (choice.isAdminPanel) copyTemplate("oidc-client-express-admin", target, vars);
        patchExpressEntry(target);
      } else {
        copyTemplate("oidc-client-nest", target, vars);
        if (choice.isAdminPanel) copyTemplate("oidc-client-nest-admin", target, vars);
        patchNestModule(target);
      }

      writeEnv(target, choice);
      loadEnvInScripts(target, backend);

      await addDeps(pm, target, ["openid-client@latest", "cookie-session@latest", "cors@latest"]);
      await addDevDeps(pm, target, ["@types/cookie-session@latest", "@types/cors@latest"]);

      update("Prettier installeren en formatteren");
      await setupPrettier(pm, target, { tailwind: false });
    },
    35000,
  );

  p.log.success(`OIDC-client aangemaakt in ./${BACKEND_DIR}.`);
}

/** Schrijft .env en .env.example met de OIDC-gegevens. */
function writeEnv(target: string, choice: OidcChoice): void {
  const lines = [
    "# Verbinding met de OIDC-server",
    `OIDC_ISSUER=${choice.issuer}`,
    `OIDC_CLIENT_ID=${choice.clientId}`,
    `OIDC_CLIENT_SECRET=${choice.clientSecret}`,
    `OIDC_REDIRECT_URI=http://localhost:${BACKEND_PORT}/auth/callback`,
    `FRONTEND_URL=http://localhost:${FRONTEND_PORT}`,
    "",
    "# Ondertekent de sessiecookie van deze app. Verzin een eigen waarde.",
    `SESSION_SECRET=${crypto.randomBytes(24).toString("hex")}`,
    "",
  ].join("\n");

  fs.writeFileSync(path.join(target, ".env"), lines, "utf8");
  fs.writeFileSync(
    path.join(target, ".env.example"),
    lines.replace(/^(OIDC_CLIENT_SECRET|SESSION_SECRET)=.*$/gm, "$1="),
    "utf8",
  );
}

/** Haakt sessie, CORS en de auth-routes aan in de Express-backend. */
function patchExpressEntry(target: string): void {
  const file = path.join(target, "src", "index.ts");
  if (!fs.existsSync(file)) return;

  let src = fs.readFileSync(file, "utf8");
  if (src.includes("authRouter")) return; // al gedaan

  src = src.replace(
    "import express from 'express'",
    [
      "import express from 'express'",
      "import cookieSession from 'cookie-session'",
      "import cors from 'cors'",
      "import { authRouter } from './auth/routes.js'",
      "import { FRONTEND_URL } from './auth/oidc.js'",
    ].join("\n"),
  );

  src = src.replace(
    "app.use(express.json())",
    [
      "// De frontend draait op een andere poort en moet cookies mee kunnen sturen.",
      "app.use(cors({ origin: FRONTEND_URL, credentials: true }))",
      "app.use(express.json())",
      "app.use(",
      "    cookieSession({",
      "        name: 'sid',",
      "        keys: [process.env.SESSION_SECRET ?? 'verander-mij'],",
      "        httpOnly: true,",
      "        sameSite: 'lax',",
      "        maxAge: 7 * 24 * 60 * 60 * 1000",
      "    })",
      ")",
      "app.use(authRouter)",
    ].join("\n"),
  );

  fs.writeFileSync(file, src, "utf8");
}

/** Haakt de AuthModule aan in de NestJS-backend. */
function patchNestModule(target: string): void {
  const moduleFile = path.join(target, "src", "app.module.ts");
  if (fs.existsSync(moduleFile)) {
    let src = fs.readFileSync(moduleFile, "utf8");
    if (!src.includes("AuthModule")) {
      src = src.replace(
        "import { Module } from '@nestjs/common'",
        "import { Module } from '@nestjs/common'\nimport { AuthModule } from './auth/auth.module'",
      );
      src = src.replace(/imports:\s*\[([^\]]*)\]/, (_m, inner: string) =>
        inner.trim() ? `imports: [${inner.trim()}, AuthModule]` : "imports: [AuthModule]",
      );
      fs.writeFileSync(moduleFile, src, "utf8");
    }
  }

  const mainFile = path.join(target, "src", "main.ts");
  if (!fs.existsSync(mainFile)) return;

  let main = fs.readFileSync(mainFile, "utf8");
  if (main.includes("cookieSession")) return;

  main = main.replace(
    "import { NestFactory } from '@nestjs/core'",
    [
      "import { NestFactory } from '@nestjs/core'",
      "import cookieSession from 'cookie-session'",
      "import { FRONTEND_URL } from './auth/oidc'",
    ].join("\n"),
  );

  main = main.replace(
    "const app = await NestFactory.create(AppModule)",
    [
      "const app = await NestFactory.create(AppModule)",
      "",
      "    // De frontend draait op een andere poort en moet cookies mee kunnen sturen.",
      "    app.enableCors({ origin: FRONTEND_URL, credentials: true })",
      "    app.use(",
      "        cookieSession({",
      "            name: 'sid',",
      "            keys: [process.env.SESSION_SECRET ?? 'verander-mij'],",
      "            httpOnly: true,",
      "            sameSite: 'lax',",
      "            maxAge: 7 * 24 * 60 * 60 * 1000",
      "        })",
      "    )",
    ].join("\n"),
  );

  fs.writeFileSync(mainFile, main, "utf8");
}

/**
 * Zorgt dat de dev/start-scripts de .env inlezen.
 * Node doet dat niet vanzelf; `--env-file` regelt het zonder extra package.
 */
function loadEnvInScripts(target: string, backend: Backend): void {
  const file = path.join(target, "package.json");
  if (!fs.existsSync(file)) return;

  const pkg = JSON.parse(fs.readFileSync(file, "utf8")) as { scripts?: Record<string, string> };
  const scripts = pkg.scripts ?? {};

  if (backend === "node") {
    scripts.dev = "tsx watch --env-file=.env src/index.ts";
    scripts.start = "node --env-file=.env dist/index.js";
  } else {
    // Nest start zijn eigen proces; --env-file gaat via NODE_OPTIONS.
    scripts["start:dev"] = "nest start --watch --exec 'node --env-file=.env'";
  }

  pkg.scripts = scripts;
  fs.writeFileSync(file, JSON.stringify(pkg, null, 4) + "\n", "utf8");
}
