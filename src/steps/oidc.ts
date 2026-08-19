import crypto from "node:crypto";
import path from "node:path";
import * as p from "@clack/prompts";
import { addDeps, addDevDeps } from "../utils/install.js";
import { withProgress } from "../utils/progress.js";
import { setupPrettier } from "../utils/prettier.js";
import { copyTemplate } from "../utils/template.js";
import { FRONTEND_PORT } from "./frontend.js";
import { BACKEND_PORT } from "./backend.js";
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
