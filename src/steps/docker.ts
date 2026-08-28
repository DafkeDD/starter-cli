import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import { render, TEMPLATE_ROOT } from "../utils/template.js";
import { mergeEnv } from "../utils/env.js";
import type { Ports } from "../utils/ports.js";

/**
 * Genereert de Docker-opzet: een Dockerfile per app en een docker-compose.yml
 * die alles samen opstart.
 *
 * De npm-manier blijft gewoon werken. Docker is een tweede manier om hetzelfde
 * project te draaien, geen vervanging.
 */

/** Welke onderdelen dit project heeft. */
export interface DockerParts {
  frontend: boolean;
  backend: boolean;
  oidc: boolean;
  database: boolean;
  /** Heeft de OIDC-hub een eigen database nodig? */
  oidcDatabase: boolean;
  /** Rendert de hub zijn schermen met de Next.js-app ernaast? */
  oidcWeb: boolean;
}

/**
 * Poort voor pgAdmin. Ver van 3000/5000/9000 vandaan, want dit is gereedschap
 * en geen onderdeel van je applicatie.
 */
const PGADMIN_PORT = 5050;

interface DockerOptions {
  projectName: string;
  ports: Ports;
  /** Startscript van de backend: "dev" bij Express, "start:dev" bij Nest. */
  backendDevScript: string;
}

/**
 * Haalt een waarde uit een .env-bestand.
 *
 * De wachtwoorden en sleutels zijn al door de vorige stappen gegenereerd en
 * weggeschreven. Ze hier opnieuw doorgeven zou betekenen dat twee plekken
 * dezelfde waarheid bijhouden - en dat loopt vroeg of laat uit elkaar.
 */
function readEnv(file: string, key: string, fallback = ""): string {
  if (!fs.existsSync(file)) return fallback;

  const match = new RegExp(`^${key}=(.*)$`, "m").exec(fs.readFileSync(file, "utf8"));
  return match?.[1]?.trim() ?? fallback;
}

/** Leest een fragment uit templates/docker/ en vult de variabelen in. */
function fragment(name: string, vars: Record<string, string | number>): string {
  return render(fs.readFileSync(path.join(TEMPLATE_ROOT, "docker", name), "utf8"), vars);
}

export function scaffoldDocker(
  parts: DockerParts,
  projectDir: string,
  options: DockerOptions,
): void {
  // Zonder app valt er niets te containeriseren.
  if (!parts.frontend && !parts.backend && !parts.oidc) return;

  const { ports } = options;
  const vars: Record<string, string | number> = {
    PROJECT_NAME: dockerName(options.projectName),
    FRONTEND_PORT: ports.frontend,
    BACKEND_PORT: ports.backend,
    OIDC_PORT: ports.oidc,
    OIDC_WEB_PORT: ports.oidcWeb,
    BACKEND_DEV_SCRIPT: options.backendDevScript,
    PGADMIN_PORT,
    DB_NAME: "",
    DB_USER: "",
  };

  p.log.step("Docker-opzet genereren ...");

  // ---- Dockerfiles --------------------------------------------------------
  const apps: Array<[dir: string, template: string]> = [];
  if (parts.frontend) apps.push(["frontend", "frontend.Dockerfile"]);
  if (parts.backend) apps.push(["backend", "backend.Dockerfile"]);
  if (parts.oidc) apps.push(["oidc", "oidc.Dockerfile"]);
  if (parts.oidcWeb) apps.push(["oidc-web", "oidc-web.Dockerfile"]);

  for (const [dir, template] of apps) {
    const target = path.join(projectDir, dir);
    if (!fs.existsSync(target)) continue;

    fs.writeFileSync(path.join(target, "Dockerfile"), fragment(template, vars), "utf8");
    fs.writeFileSync(
      path.join(target, ".dockerignore"),
      fs.readFileSync(path.join(TEMPLATE_ROOT, "docker", "dockerignore"), "utf8"),
      "utf8",
    );
  }

  // ---- docker-compose.yml -------------------------------------------------
  // Alleen de diensten die dit project echt heeft.
  const pieces = [fragment("compose-head.yml", vars)];
  if (parts.database || parts.oidcDatabase) pieces.push(fragment("compose-db.yml", vars));
  if (parts.oidc) pieces.push(fragment("compose-oidc.yml", vars));
  if (parts.oidcWeb) pieces.push(fragment("compose-oidc-web.yml", vars));
  if (parts.backend) pieces.push(fragment("compose-backend.yml", vars));
  if (parts.frontend) pieces.push(fragment("compose-frontend.yml", vars));
  const heeftDatabase = parts.database || parts.oidcDatabase;
  if (heeftDatabase) {
    pieces.push(fragment("compose-pgadmin.yml", vars));
    pieces.push(fragment("compose-volumes.yml", vars));
    pieces.push(fragment("compose-volumes-pgadmin.yml", vars));
  }

  fs.writeFileSync(path.join(projectDir, "docker-compose.yml"), pieces.join(""), "utf8");

  // De verbinding die pgAdmin bij de eerste start inleest.
  if (heeftDatabase) {
    const scripts = path.join(projectDir, "docker");
    fs.mkdirSync(scripts, { recursive: true });

    const backendEnvFile = path.join(projectDir, "backend", ".env");
    const oidcEnvFile = path.join(projectDir, "oidc", ".env");
    const bron = fs.existsSync(backendEnvFile) ? backendEnvFile : oidcEnvFile;

    fs.writeFileSync(
      path.join(scripts, "pgadmin-servers.json"),
      fragment("pgadmin-servers.json", {
        ...vars,
        DB_NAME: readEnv(bron, "DB_NAME", "app01"),
        DB_USER: readEnv(bron, "DB_USER", "app01"),
      }),
      "utf8",
    );
  }

  // Het initscript dat de tweede database aanmaakt voor de hub.
  if (parts.oidcDatabase) {
    const scripts = path.join(projectDir, "docker");
    fs.mkdirSync(scripts, { recursive: true });

    const file = path.join(scripts, "init-oidc-db.sh");
    fs.writeFileSync(
      file,
      fs.readFileSync(path.join(TEMPLATE_ROOT, "docker", "init-oidc-db.sh"), "utf8"),
      "utf8",
    );
    // Uitvoerbaar maken; op Windows is dit een no-op maar het schaadt niet.
    fs.chmodSync(file, 0o755);
  }

  // ---- .env voor compose --------------------------------------------------
  // Compose vult hiermee de ${...} in docker-compose.yml in. Dit staat in de
  // hoofdmap en is iets anders dan de .env van elke app.
  // De bron van waarheid is de .env die de vorige stappen al schreven.
  const backendEnv = path.join(projectDir, "backend", ".env");
  const oidcEnv = path.join(projectDir, "oidc", ".env");
  const anyEnv = fs.existsSync(backendEnv) ? backendEnv : oidcEnv;

  const lines = [
    "# Wordt gelezen door docker compose om de ${...} in docker-compose.yml in",
    "# te vullen. Dit is NIET de .env van je apps - die staan in backend/ en",
    "# oidc/ en worden binnen de containers overschreven door compose.",
    "",
    `DB_USER=${readEnv(anyEnv, "DB_USER", "app01")}`,
    `DB_PASSWORD=${readEnv(anyEnv, "DB_PASSWORD")}`,
    `DB_NAME=${readEnv(backendEnv, "DB_NAME", "app01")}`,
    `OIDC_DB_NAME=${readEnv(oidcEnv, "DB_NAME", "oidc")}`,
    `DB_PORT=${ports.db}`,
    "",
    `OIDC_CLIENT_ID=${readEnv(backendEnv, "OIDC_CLIENT_ID")}`,
    `OIDC_CLIENT_SECRET=${readEnv(backendEnv, "OIDC_CLIENT_SECRET")}`,
    `SESSION_SECRET=${readEnv(backendEnv, "SESSION_SECRET")}`,
    "",
    "# Inloggen op pgAdmin (npm run db:admin). Alleen lokaal, dus dit mag simpel.",
    "PGADMIN_EMAIL=admin@localhost",
    "PGADMIN_PASSWORD=admin",
    "",
  ].join("\n");

  mergeEnv(path.join(projectDir, ".env"), lines);
  mergeEnv(
    path.join(projectDir, ".env.example"),
    lines.replace(/^(DB_PASSWORD|OIDC_CLIENT_SECRET|SESSION_SECRET)=.*$/gm, "$1="),
  );

  // De .env in de hoofdmap hoort net zo goed niet in git.
  const gitignore = path.join(projectDir, ".gitignore");
  const current = fs.existsSync(gitignore) ? fs.readFileSync(gitignore, "utf8") : "";
  if (!current.split(/\r?\n/).includes(".env")) {
    fs.writeFileSync(gitignore, current.trimEnd() + "\n.env\n", "utf8");
  }

  p.log.success("Docker-opzet aangemaakt (Dockerfile per app + docker-compose.yml).");
}

/**
 * Compose accepteert alleen kleine letters, cijfers, streepje en underscore in
 * een projectnaam, en het moet met een letter of cijfer beginnen.
 */
function dockerName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleaned === "" || !/^[a-z0-9]/.test(cleaned) ? `project-${cleaned}` : cleaned;
}
