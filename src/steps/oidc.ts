import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import { addDeps, addDevDeps } from "../utils/install.js";
import { withProgress } from "../utils/progress.js";
import { setupPrettier } from "../utils/prettier.js";
import { copyTemplate } from "../utils/template.js";
import { mergeEnv } from "../utils/env.js";
import { scaffoldDatabase, databaseLabel, type Database, type DbTarget } from "./database.js";
import { FRONTEND_DIR, FRONTEND_PORT } from "./frontend.js";
import type { Frontend } from "./frontend.js";
import { BACKEND_DIR, BACKEND_PORT } from "./backend.js";
import type { Backend } from "./backend.js";
import type { PackageManager } from "../types.js";

/** Map voor een nieuwe OIDC-server. */
export const OIDC_DIR = "oidc";

/** Poort van de OIDC-server, naast frontend (3000) en backend (5000). */
/** Standaardpoort van de hub. De CLI kan een andere kiezen; zie utils/ports.ts. */
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
 * Hoe de hub draait.
 *
 * "standalone" is een eigen servertje dat zijn schermen als HTML rendert:
 * niets extra's, en de hub staat volledig op zichzelf.
 *
 * "inapp" zet Next.js in datzelfde proces. Dan is de hub één app - de
 * OIDC-endpoints, de inlogschermen en je eigen portaal delen één server, één
 * poort en één origin. Geen proxy nodig, en de interaction-cookie klopt altijd.
 * De hub verhuist dan wel naar /oidc, want de wortel is dan van jouw schermen.
 */
export type HubMode = "standalone" | "inapp";

/** Welke server er onder de in-app hub ligt. Nest draait ook op Express. */
export type HubServer = "express" | "nestjs";

export interface HubChoice {
  mode: HubMode;
  server: HubServer;
}

/** Waar de hub hangt als hij in je eigen app zit. */
export const HUB_MOUNT = "/oidc";

export async function askHub(): Promise<HubChoice> {
  const mode = await p.select({
    message: "Hoe draait de OIDC-hub?",
    initialValue: "standalone" as HubMode,
    options: [
      {
        value: "standalone" as const,
        label: "Als eigen server",
        hint: "kaal en zelfstandig, schermen als HTML",
      },
      {
        value: "inapp" as const,
        label: "Als één app met Next.js",
        hint: `eigen schermen, hub op ${HUB_MOUNT}`,
      },
    ],
  });

  if (p.isCancel(mode)) {
    p.cancel("Geannuleerd.");
    process.exit(0);
  }

  if (mode === "standalone") return { mode, server: "express" };

  const server = await p.select({
    message: "Welke server onder de hub?",
    initialValue: "express" as HubServer,
    options: [
      { value: "express" as const, label: "Express", hint: "dun; je schrijft de structuur zelf" },
      {
        value: "nestjs" as const,
        label: "NestJS",
        hint: "modules en DI, voor als er echt API bij komt",
      },
    ],
  });

  if (p.isCancel(server)) {
    p.cancel("Geannuleerd.");
    process.exit(0);
  }

  return { mode, server };
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
  hub: HubChoice,
  ports: { oidc: number; backend: number; frontend: number } = {
    oidc: OIDC_PORT,
    backend: BACKEND_PORT,
    frontend: FRONTEND_PORT,
  },
): Promise<void> {
  if (choice.mode !== "new") return;

  const target = path.join(projectDir, OIDC_DIR);
  p.log.step(`OIDC-server opzetten in ./${OIDC_DIR} (poort ${ports.oidc}) ...`);

  await withProgress(
    "OIDC-server installeren",
    async (update) => {
      // Leeg als de hub een eigen server is: dan is hij baas over alle paden.
      // Zit hij in je app, dan moet er ruimte over blijven voor jouw schermen.
      const mount = hub.mode === "inapp" ? HUB_MOUNT : "";

      copyTemplate("oidc-server", target, {
        MOUNT: mount,
        OIDC_PORT: ports.oidc,
        BACKEND_PORT: ports.backend,
        FRONTEND_PORT: ports.frontend,
        PROJECT_NAME: projectName,
        CLIENT_ID: choice.clientId,
        CLIENT_SECRET: choice.clientSecret,
        ACCENT: "#0f9d58",
        TAGLINE: "Centrale login",
      });

      await addDeps(pm, target, [
        "oidc-provider@latest",
        "express@latest",
        "jose@latest",
        // Voor de bestandsvariant. Kies je later een database, dan hasht de hub
        // met scrypt uit node:crypto en heeft hij dit pakket niet meer nodig.
        "bcryptjs@latest",
      ]);
      await addDevDeps(pm, target, [
        "typescript@latest",
        "tsx@latest",
        "@types/node@latest",
        "@types/express@latest",
        "@types/oidc-provider@latest",
      ]);

      // De hub leest PORT en OIDC_ISSUER uit .env, dus hij heeft altijd een
      // env-lader nodig - ook zonder database.
      fs.writeFileSync(path.join(target, "src", "env.ts"), HUB_ENV_LOADER, "utf8");

      if (hub.mode === "inapp") {
        update("Schermen en server samenvoegen");
        await scaffoldInAppHub(hub, target, projectName, pm, mount);
      }

      // Het startbestand verschilt per opzet; de env-lader hoort in beide als
      // allereerste import, want ES-modules evalueren imports vooraf.
      prependEnvImport(
        path.join(target, "src", hub.server === "nestjs" ? "main.ts" : "index.ts"),
      );

      mergeEnv(
        path.join(target, ".env"),
        [
          "# Poort van de hub. In Docker zet compose deze variabele.",
          `PORT=${ports.oidc}`,
          "",
          "# Moet exact de URL zijn die ook de browser gebruikt - anders klopt de",
          "# iss in het id_token niet en faalt de validatie bij de clients.",
          `OIDC_ISSUER=http://localhost:${ports.oidc}${mount}`,
          "",
        ].join("\n"),
      );

      update("Prettier installeren en formatteren");
      await setupPrettier(pm, target, { tailwind: false });
    },
    45000,
  );

  p.log.success(
    hub.mode === "inapp"
      ? `Hub aangemaakt in ./${OIDC_DIR} (${hub.server === "nestjs" ? "NestJS" : "Express"} + Next.js, één proces).`
      : `OIDC-server aangemaakt in ./${OIDC_DIR}.`,
  );
}

/**
 * Next.js in dezelfde map en hetzelfde proces als de hub zetten.
 *
 * De schermen komen uit templates/oidc-inapp; bij NestJS komt daar een eigen
 * opstartbestand overheen. src/index.ts van de Express-opzet gaat dan weg -
 * twee startbestanden naast elkaar is vragen om de verkeerde te draaien.
 */
async function scaffoldInAppHub(
  hub: HubChoice,
  target: string,
  projectName: string,
  pm: PackageManager,
  mount: string,
): Promise<void> {
  copyTemplate("oidc-inapp", target, { MOUNT: mount, BRAND_NAME: projectName });

  await addDeps(pm, target, ["next@latest", "react@latest", "react-dom@latest"]);
  await addDevDeps(pm, target, [
    "@types/react@latest",
    "@types/react-dom@latest",
    "tailwindcss@latest",
    "@tailwindcss/postcss@latest",
  ]);

  if (hub.server === "nestjs") {
    copyTemplate("oidc-inapp-nest", target, { MOUNT: mount });
    fs.rmSync(path.join(target, "src", "index.ts"), { force: true });

    await addDeps(pm, target, [
      "@nestjs/common@latest",
      "@nestjs/core@latest",
      "@nestjs/platform-express@latest",
      "reflect-metadata@latest",
      "rxjs@latest",
    ]);
    // TypeScript vastzetten op 6. De Nest-CLI compileert via de programmatische
    // compiler-API, en die zit niet in TypeScript 7.0 - `nest build` stopt daar
    // met "does not expose the programmatic compiler API". Terug in 7.1, zegt
    // de foutmelding; tot die tijd is dit geen voorkeur maar een vereiste.
    await addDevDeps(pm, target, ["@nestjs/cli@latest", "typescript@^6"]);
  }

  setHubScripts(target, hub);
}

/**
 * De startscripts van de hub.
 *
 * Express draait op tsx. NestJS niet: die heeft emitDecoratorMetadata nodig
 * voor zijn dependency injection, en dat kan esbuild - waar tsx op draait -
 * niet. Vandaar de gewone Nest-compiler, met een eigen tsconfig.build.json die
 * de Next-bestanden overslaat.
 */
function setHubScripts(target: string, hub: HubChoice): void {
  const file = path.join(target, "package.json");
  if (!fs.existsSync(file)) return;

  const pkg = JSON.parse(fs.readFileSync(file, "utf8")) as { scripts?: Record<string, string> };

  pkg.scripts = {
    ...pkg.scripts,
    ...(hub.server === "nestjs"
      ? { dev: "nest start --watch", build: "nest build", start: "node dist/main.js" }
      : { dev: "tsx watch src/index.ts", start: "tsx src/index.ts" }),
    typecheck: "tsc --noEmit",
  };

  fs.writeFileSync(file, JSON.stringify(pkg, null, 4) + "\n", "utf8");
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
  ports: { backend: number; frontend: number } = {
    backend: BACKEND_PORT,
    frontend: FRONTEND_PORT,
  },
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
    BACKEND_PORT: ports.backend,
    FRONTEND_PORT: ports.frontend,
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

      writeEnv(target, choice, ports);
      loadEnvInCode(target, backend);

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
function writeEnv(
  target: string,
  choice: OidcChoice,
  ports: { backend: number; frontend: number },
): void {
  const lines = [
    "# Verbinding met de OIDC-server",
    `OIDC_ISSUER=${choice.issuer}`,
    `OIDC_CLIENT_ID=${choice.clientId}`,
    `OIDC_CLIENT_SECRET=${choice.clientSecret}`,
    `OIDC_REDIRECT_URI=http://localhost:${ports.backend}/auth/callback`,
    `FRONTEND_URL=http://localhost:${ports.frontend}`,
    "",
    "# Ondertekent de sessiecookie van deze app. Verzin een eigen waarde.",
    `SESSION_SECRET=${crypto.randomBytes(24).toString("hex")}`,
    "",
  ].join("\n");

  // Aanvullen, niet overschrijven: de databasestap heeft hier mogelijk al
  // DB_-sleutels neergezet.
  mergeEnv(path.join(target, ".env"), lines);
  mergeEnv(
    path.join(target, ".env.example"),
    lines.replace(/^(OIDC_CLIENT_SECRET|SESSION_SECRET)=.*$/gm, "$1="),
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
        "import { Module } from '@nestjs/common'\nimport { AuthModule } from './auth/auth.module.js'",
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
      "import { FRONTEND_URL } from './auth/oidc.js'",
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
 * Zet de import van src/env.ts bovenaan het entry-bestand.
 *
 * Waarom een apart bestand en niet gewoon `process.loadEnvFile()` bovenaan
 * index.ts: in ESM draaien alle imports vóór de rest van de module. Die aanroep
 * zou dus ná het laden van auth/oidc.ts gebeuren, en die leest `process.env`
 * meteen bij het laden — te laat dus. Als eerste import werkt het wel, want
 * ESM evalueert imports in de volgorde waarin ze staan.
 *
 * En geen `--env-file` in de npm-scripts: dat vraagt quotes, en cmd quote
 * anders dan bash. Op Windows brak dat.
 */
function loadEnvInCode(target: string, backend: Backend): void {
  const isExpress = backend === "node";
  const file = path.join(target, "src", isExpress ? "index.ts" : "main.ts");
  if (!fs.existsSync(file)) return;

  const src = fs.readFileSync(file, "utf8");
  if (src.includes("./env")) return;

  // Zowel Express als NestJS 12 draaien op ESM, dus altijd met extensie.
  const line = "import './env.js'";
  const comment = "// Leest .env in. Moet de eerste import blijven — zie src/env.ts.";

  fs.writeFileSync(file, comment + "\n" + line + "\n" + src, "utf8");
}

/* ------------------------------------------------------------------ */
/* Frontend: loginpagina, auth-check en (optioneel) beheerscherm        */
/* ------------------------------------------------------------------ */

/** Vertalingen die de OIDC-schermen nodig hebben, in alle vier de talen. */
const OIDC_MESSAGES: Record<string, Record<string, Record<string, string>>> = {
  en: {
    Login: {
      title: "Sign in",
      description:
        "Signing in happens on the central identity server. You will be sent there and back again.",
      button: "Continue to sign in",
      hint: "Already signed in elsewhere? Then you come straight back in.",
    },
    Auth: {
      login: "Sign in",
      logout: "Sign out",
      admin: "admin",
      signedInAs: "Signed in as",
      notSignedIn: "You are not signed in yet.",
      name: "Name",
      email: "Email",
      role: "Role",
      id: "User ID",
    },
    Admin: {
      title: "Administration",
      users: "Users ({count})",
      clients: "Connected apps ({count})",
      name: "Name",
      email: "Email",
      role: "Role",
      status: "Status",
      clientId: "client_id",
      redirectUris: "Redirect URIs",
      active: "active",
      blocked: "blocked",
      block: "Block",
      unblock: "Unblock",
      you: "you",
      denied: "No access",
      deniedBody: "You are signed in with the role {role}. This page is for administrators only.",
      loadError: "Could not load the data (HTTP {status}).",
    },
  },
  de: {
    Login: {
      title: "Anmelden",
      description:
        "Die Anmeldung läuft über den zentralen Identity-Server. Du wirst dorthin und wieder zurück geschickt.",
      button: "Weiter zur Anmeldung",
      hint: "Schon woanders angemeldet? Dann kommst du direkt rein.",
    },
    Auth: {
      login: "Anmelden",
      logout: "Abmelden",
      admin: "Admin",
      signedInAs: "Angemeldet als",
      notSignedIn: "Du bist noch nicht angemeldet.",
      name: "Name",
      email: "E-Mail",
      role: "Rolle",
      id: "Benutzer-ID",
    },
    Admin: {
      title: "Verwaltung",
      users: "Benutzer ({count})",
      clients: "Verbundene Apps ({count})",
      name: "Name",
      email: "E-Mail",
      role: "Rolle",
      status: "Status",
      clientId: "client_id",
      redirectUris: "Redirect-URIs",
      active: "aktiv",
      blocked: "gesperrt",
      block: "Sperren",
      unblock: "Entsperren",
      you: "du",
      denied: "Kein Zugriff",
      deniedBody: "Du bist mit der Rolle {role} angemeldet. Diese Seite ist nur für Administratoren.",
      loadError: "Daten konnten nicht geladen werden (HTTP {status}).",
    },
  },
  nl: {
    Login: {
      title: "Inloggen",
      description:
        "Inloggen gebeurt op de centrale identity-server. Je wordt daarheen gestuurd en komt daarna terug.",
      button: "Verder met inloggen",
      hint: "Al ergens anders ingelogd? Dan kom je meteen binnen.",
    },
    Auth: {
      login: "Inloggen",
      logout: "Uitloggen",
      admin: "beheerder",
      signedInAs: "Ingelogd als",
      notSignedIn: "Je bent nog niet ingelogd.",
      name: "Naam",
      email: "E-mail",
      role: "Rol",
      id: "Gebruikers-ID",
    },
    Admin: {
      title: "Beheer",
      users: "Gebruikers ({count})",
      clients: "Aangesloten apps ({count})",
      name: "Naam",
      email: "E-mail",
      role: "Rol",
      status: "Status",
      clientId: "client_id",
      redirectUris: "Redirect-URI's",
      active: "actief",
      blocked: "geblokkeerd",
      block: "Blokkeren",
      unblock: "Deblokkeren",
      you: "jij",
      denied: "Geen toegang",
      deniedBody: "Je bent ingelogd met de rol {role}. Deze pagina is alleen voor beheerders.",
      loadError: "Kon de gegevens niet laden (HTTP {status}).",
    },
  },
  fr: {
    Login: {
      title: "Connexion",
      description:
        "La connexion se fait sur le serveur d'identité central. Vous y serez redirigé puis ramené ici.",
      button: "Continuer vers la connexion",
      hint: "Déjà connecté ailleurs ? Vous entrez directement.",
    },
    Auth: {
      login: "Connexion",
      logout: "Déconnexion",
      admin: "admin",
      signedInAs: "Connecté en tant que",
      notSignedIn: "Vous n'êtes pas encore connecté.",
      name: "Nom",
      email: "E-mail",
      role: "Rôle",
      id: "Identifiant",
    },
    Admin: {
      title: "Administration",
      users: "Utilisateurs ({count})",
      clients: "Applications connectées ({count})",
      name: "Nom",
      email: "E-mail",
      role: "Rôle",
      status: "Statut",
      clientId: "client_id",
      redirectUris: "URI de redirection",
      active: "actif",
      blocked: "bloqué",
      block: "Bloquer",
      unblock: "Débloquer",
      you: "vous",
      denied: "Accès refusé",
      deniedBody: "Vous êtes connecté avec le rôle {role}. Cette page est réservée aux administrateurs.",
      loadError: "Impossible de charger les données (HTTP {status}).",
    },
  },
};

/** Zet de loginpagina, de auth-check en eventueel het beheerscherm in de frontend. */
export function scaffoldOidcFrontend(
  choice: OidcChoice,
  frontend: Frontend,
  projectDir: string,
  backendPort: number = BACKEND_PORT,
): void {
  if (choice.mode === "none") return;
  if (frontend === "none") {
    p.log.warn("Geen frontend gekozen — de loginpagina wordt overgeslagen.");
    return;
  }

  const target = path.join(projectDir, FRONTEND_DIR);
  const vars = { BACKEND_URL: `http://localhost:${backendPort}` };

  copyTemplate("oidc-frontend", target, vars);
  if (choice.isAdminPanel) copyTemplate("oidc-frontend-admin", target, vars);

  writeFrontendEnv(target, backendPort);
  mergeMessages(target, choice.isAdminPanel);
  patchProxy(target, choice.isAdminPanel);
  patchHomePage(target);

  p.log.success(
    `Loginpagina${choice.isAdminPanel ? " en beheerscherm" : ""} toegevoegd aan ./${FRONTEND_DIR}.`,
  );
}

/**
 * Zet de ingelogde gebruiker op de homepagina.
 *
 * Zonder dit staan UserBadge en CurrentUser er wel, maar hangen ze nergens in -
 * dan log je in, kom je terug op / en zie je niets veranderen. We haken aan op
 * twee regels die deze CLI zelf in page.tsx heeft geschreven, dus die staan er
 * letterlijk zo. Wijk je daarvan af, dan slaan we het over met een melding in
 * plaats van je bestand te verminken.
 */
function patchHomePage(target: string): void {
  const file = path.join(target, "src", "app", "[locale]", "page.tsx");
  if (!fs.existsSync(file)) return;

  let src = fs.readFileSync(file, "utf8");
  if (src.includes("CurrentUser")) return;

  const importAnchor = "import ThemeToggle from '@/components/theme/ThemeToggle'";
  const mainAnchor =
    "<main className='flex min-h-screen flex-col items-center justify-center gap-8 p-8'>";
  const localeAnchor =
    "<p className='text-muted-foreground mt-8 font-mono text-xs'>{t('activeLocale', { locale })}</p>";

  if (!src.includes(importAnchor) || !src.includes(mainAnchor) || !src.includes(localeAnchor)) {
    p.log.warn(
      "De homepagina ziet er anders uit dan verwacht; UserBadge en CurrentUser zijn niet\n" +
        "ingehangen. Zet ze zelf in src/app/[locale]/page.tsx:\n" +
        "  import UserBadge from '@/components/auth/UserBadge'\n" +
        "  import CurrentUser from '@/components/auth/CurrentUser'",
    );
    return;
  }

  // Inlog-/uitlogknop rechtsboven, boven de kaart.
  src = src.replace(
    importAnchor,
    `${importAnchor}\nimport UserBadge from '@/components/auth/UserBadge'\nimport CurrentUser from '@/components/auth/CurrentUser'`,
  );

  src = src.replace(
    mainAnchor,
    `${mainAnchor}\n            <header className='flex w-full max-w-xl justify-end'>\n                <UserBadge />\n            </header>\n`,
  );

  // En de gegevens zelf in de kaart, boven de voetnoten.
  src = src.replace(
    localeAnchor,
    `<div className='mt-8'>\n                    <CurrentUser />\n                </div>\n\n                ${localeAnchor}`,
  );

  fs.writeFileSync(file, src, "utf8");
}

/** De frontend moet weten waar de backend draait. */
function writeFrontendEnv(target: string, backendPort: number): void {
  const file = path.join(target, ".env.local");
  const lines = [
    "# Waar de backend draait. Server-side gebruikt BACKEND_URL,",
    "# client components gebruiken NEXT_PUBLIC_BACKEND_URL.",
    `BACKEND_URL=http://localhost:${backendPort}`,
    `NEXT_PUBLIC_BACKEND_URL=http://localhost:${backendPort}`,
    "",
  ].join("\n");

  fs.writeFileSync(file, lines, "utf8");
  fs.writeFileSync(path.join(target, ".env.example"), lines, "utf8");
}

/** Voegt de OIDC-teksten toe aan messages/<locale>.json, zonder de rest te raken. */
function mergeMessages(target: string, includeAdmin: boolean): void {
  for (const [locale, sections] of Object.entries(OIDC_MESSAGES)) {
    const file = path.join(target, "messages", `${locale}.json`);
    if (!fs.existsSync(file)) continue;

    const messages = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
    for (const [name, entries] of Object.entries(sections)) {
      if (name === "Admin" && !includeAdmin) continue;
      messages[name] = { ...(messages[name] as object | undefined), ...entries };
    }

    fs.writeFileSync(file, JSON.stringify(messages, null, 4) + "\n", "utf8");
  }
}

/**
 * Voegt een auth-check toe aan de bestaande next-intl proxy.
 *
 * Bewust alleen een cookie-check, geen call naar de backend: middleware draait
 * bij élk request en dat zou elke paginaweergave vertragen. De échte controle
 * gebeurt server-side in de pagina zelf, en nog eens in de backend.
 */
function patchProxy(target: string, includeAdmin: boolean): void {
  const file = path.join(target, "src", "proxy.ts");
  if (!fs.existsSync(file)) return;

  let src = fs.readFileSync(file, "utf8");
  if (src.includes("PROTECTED_PREFIXES")) return;

  const protectedList = includeAdmin ? "['/admin']" : "[]";

  src = src.replace(
    "import createMiddleware from 'next-intl/middleware'",
    [
      "import createMiddleware from 'next-intl/middleware'",
      "import { NextResponse, type NextRequest } from 'next/server'",
    ].join("\n"),
  );

  src = src.replace(
    "export default createMiddleware(routing)",
    [
      "const intlMiddleware = createMiddleware(routing)",
      "",
      "/**",
      " * Paden die alleen voor ingelogde gebruikers zijn. Vul aan naar wens.",
      " */",
      `const PROTECTED_PREFIXES: string[] = ${protectedList}`,
      "",
      "/**",
      " * Snelle poort: is er überhaupt een sessiecookie? Zo niet, meteen naar",
      " * /login. De echte controle (bestaat de sessie, welke rol) gebeurt",
      " * server-side in de pagina en in de backend — een cookie bewijst niets.",
      " */",
      "export default function proxy(request: NextRequest) {",
      "    const path = request.nextUrl.pathname",
      "    const isProtected = PROTECTED_PREFIXES.some(prefix => path.startsWith(prefix))",
      "",
      "    if (isProtected && !request.cookies.has('sid')) {",
      "        const url = request.nextUrl.clone()",
      "        url.pathname = '/login'",
      "        return NextResponse.redirect(url)",
      "    }",
      "",
      "    return intlMiddleware(request)",
      "}",
    ].join("\n"),
  );

  fs.writeFileSync(file, src, "utf8");
}

/**
 * Zet `import './env.js'` als allereerste regel van de hub.
 *
 * Moet echt de eerste import zijn: ES-modules evalueren alle imports voordat de
 * code eronder draait, dus een process.loadEnvFile() halverwege komt te laat en
 * de database verbindt dan met de standaardwaarden.
 */
function prependEnvImport(file: string): void {
  if (!fs.existsSync(file)) return;

  const source = fs.readFileSync(file, "utf8");
  if (source.includes("./env.js")) return;

  const comment = "// Leest .env in. Moet de eerste import blijven - zie src/env.ts.";
  fs.writeFileSync(file, `${comment}\nimport './env.js'\n\n${source}`, "utf8");
}

/** Zelfde env-lader als in de backend; zie de uitleg daar. */
const HUB_ENV_LOADER = `try {
    process.loadEnvFile()
} catch {
    // Geen .env aanwezig - dan gelden de terugvalwaarden in de code.
}

// Maakt van dit bestand een module in plaats van een globaal script.
export {}
`;

/**
 * Zet de database onder de OIDC-hub.
 *
 * Bewust een aparte stap: zo kan de CLI de databasevraag pas stellen nadat
 * alles geinstalleerd is, in plaats van vooraf.
 */
export async function scaffoldOidcDatabase(
  choice: OidcChoice,
  projectDir: string,
  pm: PackageManager,
  database: Database,
  db: DbTarget,
  dbPort: number,
  oidcPort: number,
): Promise<void> {
  if (choice.mode !== "new" || database === "none") return;

  const target = path.join(projectDir, OIDC_DIR);
  p.log.step(`Opslag van de OIDC-hub naar ${databaseLabel(database)} ...`);

  await withProgress(
    "Databaselaag opzetten",
    async (update) => {
      // Eigen database ("oidc"), zelfde rol als de backend: de hub deelt geen
      // tabellen met je app, wel het account waarmee je erin kijkt.
      await scaffoldDatabase(database, target, "none", pm, update, db, dbPort, oidcPort);

      update("OIDC-opslag naar de database verhuizen");
      // Overschrijft adapter.ts en users.ts met de databaseversies en zet de
      // OIDC-migratie klaar. De demo-migratie van de backend hoort hier niet.
      fs.rmSync(path.join(target, "src", "db", "migrations", "001_init.ts"), { force: true });
      copyTemplate("oidc-db", target, {});
    },
    35000,
  );

  p.log.success(`OIDC-hub gebruikt nu ${databaseLabel(database)}.`);
}
