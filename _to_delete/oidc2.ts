import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import { addDeps, addDevDeps } from "../utils/install.js";
import { withProgress } from "../utils/progress.js";
import { setupPrettier } from "../utils/prettier.js";
import { installDesign } from "./shell.js";
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

/**
 * De map van een hub-app: frontend en hub in één.
 *
 * Heet bewust niet "oidc", want dat is hij maar voor een klein deel - het is je
 * app, met de identiteitsserver erin.
 */
export const APP_DIR = "app";

/** Poort van de OIDC-server, naast frontend (3000) en backend (5000). */
/** Standaardpoort van de hub. De CLI kan een andere kiezen; zie utils/ports.ts. */
export const OIDC_PORT = 9000;

/** Interne poort van de hub bij een hub-app; alleen Next praat ermee. */
export const HUB_API_PORT = 9600;

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
  /** Alleen bij "existing": waarmee de CLI zich bij de hub aanmeldt. */
  registrationToken?: string;
  /** Mag je vanuit deze app een account aanmaken? Zet de hub per client. */
  allowRegistration?: boolean;
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

export async function askHub(hasFrontend: boolean): Promise<HubChoice> {
  // Zonder Next-frontend valt er niets samen te voegen: de schermen van een
  // hub-app zijn pagina's van die frontend.
  if (!hasFrontend) return { mode: "standalone", server: "express" };

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
        hint: `je frontend voorop, hub op ${HUB_MOUNT}`,
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
/**
 * Vraagt de discovery van een hub op.
 *
 * Een OIDC-server publiceert zichzelf op /.well-known/openid-configuration.
 * Komt daar geen JSON met een issuer uit, dan wijst de URL niet naar een hub -
 * meestal naar de Next-frontend die ervoor staat, en die antwoordt gewoon met
 * HTML. Vandaar dat je anders pas bij de eerste login "unexpected HTTP
 * response status code" te zien krijgt.
 */
async function discover(base: string): Promise<string | null> {
  try {
    const res = await fetch(`${base}/.well-known/openid-configuration`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { issuer?: unknown };
    // De hub is baas over zijn eigen naam: de issuer uit de discovery moet
    // exact in de tokens staan, dus die nemen we over en niet wat jij typte.
    return typeof body.issuer === "string" ? body.issuer.replace(/\/$/, "") : base;
  } catch {
    return null;
  }
}

/**
 * Controleert de opgegeven hub-URL en corrigeert hem waar het kan.
 *
 * Een hub-app draait zijn hub op {@link HUB_MOUNT}, dus http://localhost:9000
 * is dan de frontend en http://localhost:9000/oidc de hub. Dat is de fout die
 * je bijna altijd maakt bij een tweede app; daarom proberen we er zelf /oidc
 * achter voor we het opgeven.
 */
async function verifyIssuer(input: string): Promise<string | null> {
  // Plak je de discovery-URL zelf, dan halen we het staartje eraf.
  const base = input
    .trim()
    .replace(/\/$/, "")
    .replace(/\/\.well-known\/openid-configuration$/, "");

  for (const kandidaat of [base, `${base}${HUB_MOUNT}`]) {
    const issuer = await discover(kandidaat);
    if (issuer) return issuer;
  }
  return null;
}

/**
 * Klopt dit registratietoken bij deze hub?
 *
 * We sturen een lege aanmelding. De hub controleert eerst het token en pas
 * daarna de inhoud, dus:
 *
 *   400  token klopt (hij struikelt over de ontbrekende client_id)
 *   401  token klopt niet
 *   503  aanmelden staat uit; de hub heeft zelf geen HUB_REGISTRATION_TOKEN
 *
 * null = hub onbereikbaar.
 */
async function tokenWerkt(issuer: string, token: string): Promise<400 | 401 | 503 | null> {
  try {
    const res = await fetch(`${issuer}/admin/api/clients`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: "{}",
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 400) return 400;
    if (res.status === 503) return 503;
    return 401;
  } catch {
    return null;
  }
}

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
  // We vragen net zo lang tot de hub echt antwoordt. Een typfout hier merk je
  // anders pas als je inlogt, en dan staat hij al in drie .env-bestanden.
  let voorstel = `http://localhost:${OIDC_PORT}${HUB_MOUNT}`;
  let issuer = "";

  for (;;) {
    const antwoord = await p.text({
      message: "URL van de bestaande OIDC-server?",
      placeholder: voorstel,
      defaultValue: voorstel,
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
    if (p.isCancel(antwoord)) {
      p.cancel("Geannuleerd.");
      process.exit(0);
    }

    const getypt = String(antwoord).trim().replace(/\/$/, "");
    const spin = p.spinner();
    spin.start("Hub controleren");
    const gevonden = await verifyIssuer(getypt);
    spin.stop(gevonden ? `Hub gevonden op ${gevonden}` : "Geen hub gevonden");

    if (gevonden) {
      if (gevonden !== getypt) {
        p.log.info(
          `De hub noemt zichzelf ${gevonden}. Die naam moet exact in de tokens staan,\n` +
            "dus die gebruiken we - niet wat je typte.",
        );
      }
      issuer = gevonden;
      break;
    }

    p.log.warn(
      `Op ${getypt} staat geen OIDC-server: /.well-known/openid-configuration\n` +
        "geeft geen geldige discovery terug. Draait de hub? En vergeet niet dat een\n" +
        `hub-app zijn hub op ${HUB_MOUNT} hangt - de wortel is dan van de frontend.`,
    );

    const toch = await p.confirm({
      message: "Toch deze URL gebruiken?",
      initialValue: false,
    });
    if (p.isCancel(toch)) {
      p.cancel("Geannuleerd.");
      process.exit(0);
    }
    if (toch === true) {
      issuer = getypt;
      break;
    }
    voorstel = getypt.endsWith(HUB_MOUNT) ? getypt : `${getypt}${HUB_MOUNT}`;
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
    message: "client_secret van deze app? (leeg = zelf een verzinnen)",
    placeholder: "wordt in .env gezet",
    defaultValue: "",
  });
  if (p.isCancel(secret)) {
    p.cancel("Geannuleerd.");
    process.exit(0);
  }

  // Zonder een kloppend token kan de CLI deze app niet bij de hub aanmelden, en
  // dan strandt je eerste login op invalid_client. Dat is de meest voorkomende
  // manier waarop een tweede app stukloopt, dus proberen we het token meteen
  // uit in plaats van het pas bij het scaffolden te merken.
  let token = "";

  for (;;) {
    const antwoord = await p.text({
      message: "Registratietoken van de hub? (HUB_REGISTRATION_TOKEN uit zijn .env)",
      placeholder: "leeg = deze app niet aanmelden",
      defaultValue: "",
    });
    if (p.isCancel(antwoord)) {
      p.cancel("Geannuleerd.");
      process.exit(0);
    }

    const getypt = String(antwoord).trim();

    if (!getypt) {
      p.log.warn(
        "Zonder token meldt de CLI deze app niet aan bij de hub, en geeft je\n" +
          "eerste login invalid_client. Het staat in de .env van de hub, op de\n" +
          "regel HUB_REGISTRATION_TOKEN.",
      );
      const overslaan = await p.confirm({
        message: "Toch overslaan en de app later zelf aanmelden?",
        initialValue: false,
      });
      if (p.isCancel(overslaan)) {
        p.cancel("Geannuleerd.");
        process.exit(0);
      }
      if (overslaan === true) break;
      continue;
    }

    const spin = p.spinner();
    spin.start("Token uitproberen");
    const uitslag = await tokenWerkt(issuer, getypt);
    spin.stop(uitslag === 400 ? "Token klopt" : "Token niet bruikbaar");

    if (uitslag === 400) {
      token = getypt;
      break;
    }

    if (uitslag === 503) {
      p.log.warn(
        "Deze hub laat aanmelden niet toe: zijn eigen HUB_REGISTRATION_TOKEN is leeg.\n" +
          "Vul die in zijn .env in en herstart hem, of meld deze app met de hand aan.",
      );
    } else if (uitslag === 401) {
      p.log.warn("De hub kent dit token niet. Kijk het na in zijn .env en plak het opnieuw.");
    } else {
      p.log.warn(`${issuer} antwoordde niet. Draait de hub nog?`);
    }

    const opnieuw = await p.confirm({ message: "Opnieuw proberen?", initialValue: true });
    if (p.isCancel(opnieuw)) {
      p.cancel("Geannuleerd.");
      process.exit(0);
    }
    if (opnieuw !== true) break;
  }

  const mayRegister = await p.confirm({
    message: "Mag je vanuit deze app een account aanmaken?",
    initialValue: false,
  });
  if (p.isCancel(mayRegister)) {
    p.cancel("Geannuleerd.");
    process.exit(0);
  }

  return {
    mode: "existing",
    issuer,
    isAdminPanel: role === "admin",
    clientId,
    clientSecret: String(secret).trim() || crypto.randomBytes(24).toString("hex"),
    registrationToken: token,
    allowRegistration: mayRegister === true,
  };
}

/** Zet de nieuwe OIDC-server op in ./oidc. */
export async function scaffoldOidcServer(
  choice: OidcChoice,
  projectDir: string,
  projectName: string,
  pm: PackageManager,
  hub: HubChoice,
  /** Waar de hub komt. Bij een hub-app is dat ./app, naast de frontend. */
  dir: string,
  ports: { oidc: number; backend: number; frontend: number; hubApi: number } = {
    oidc: OIDC_PORT,
    backend: BACKEND_PORT,
    frontend: FRONTEND_PORT,
    hubApi: HUB_API_PORT,
  },
): Promise<void> {
  if (choice.mode !== "new") return;

  const target = path.join(projectDir, dir);
  p.log.step(`OIDC-server opzetten in ./${dir} (poort ${ports.oidc}) ...`);

  await withProgress(
    "OIDC-server installeren",
    async (update) => {
      // Leeg als de hub een eigen server is: dan is hij baas over alle paden.
      // Zit hij in je app, dan moet er ruimte over blijven voor jouw schermen.
      const mount = hub.mode === "inapp" ? HUB_MOUNT : "";

      // Staat er al een app in deze map (de hub-app), dan mogen de
      // projectbestanden van de hub-template die niet overschrijven: daar
      // zitten next.config.ts met next-intl en de package.json van de frontend.
      preserving(
        target,
        // tsconfig hoort er ook bij: die van de frontend heeft de paths voor
        // "@/..." en de jsx-instelling. De Node-tsconfig van de hub-template zou
        // die overschrijven en dan vindt Next geen enkel component meer.
        ["package.json", ".gitignore", "next.config.ts", "postcss.config.mjs", "tsconfig.json"],
        () =>
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
        }),
      );

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
        await scaffoldInAppHub(hub, target, projectName, pm, mount, {
          publiek: ports.oidc,
          intern: ports.hubApi,
        });
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
          `PORT=${hub.mode === "inapp" ? ports.hubApi : ports.oidc}`,
          "",
          "# Moet exact de URL zijn die ook de browser gebruikt - anders klopt de",
          "# iss in het id_token niet en faalt de validatie bij de clients.",
          `OIDC_ISSUER=http://localhost:${ports.oidc}${mount}`,
          "",
          "# Waarmee starter-cli een nieuwe app bij deze hub aanmeldt. Geef dit",
          "# door als je een volgend project aansluit. Leeg = aanmelden staat uit.",
          `HUB_REGISTRATION_TOKEN=${crypto.randomBytes(24).toString("hex")}`,
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
  ports: { publiek: number; intern: number },
): Promise<void> {
  copyTemplate("oidc-inapp", target, { MOUNT: mount, BRAND_NAME: projectName });

  patchNextConfig(target, mount, ports.intern);
  raiseTsTarget(target);

  // next en react staan er al: dit zijn pagina's van je eigen frontend.
  // concurrently start Next en de hub samen met één commando.
  await addDevDeps(pm, target, ["concurrently@latest"]);

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

  setHubScripts(target, hub, ports.publiek);
}

/**
 * Voert `fn` uit en zet daarna terug wat er al stond.
 *
 * copyTemplate overschrijft; bij een hub-app zit er al een Next-project in de
 * map en dat mag niet sneuvelen.
 */
function preserving(target: string, names: string[], fn: () => void): void {
  const kept = new Map<string, string>();
  for (const name of names) {
    const file = path.join(target, name);
    if (fs.existsSync(file)) kept.set(file, fs.readFileSync(file, "utf8"));
  }

  fn();

  for (const [file, content] of kept) fs.writeFileSync(file, content, "utf8");
}

/**
 * Tilt het TypeScript-doel naar ES2022.
 *
 * create-next-app schrijft ES2017, en daar kent TypeScript de d-vlag op reguliere
 * expressies nog niet - die gebruikt de adapter van de hub. `npm run typecheck`
 * struikelt daar anders over, terwijl de code op runtime prima werkt.
 */
function raiseTsTarget(target: string): void {
  const file = path.join(target, "tsconfig.json");
  if (!fs.existsSync(file)) return;

  const raw = fs.readFileSync(file, "utf8");
  if (/"target"\s*:\s*"ES20(1[89]|2\d)"/i.test(raw)) return;

  fs.writeFileSync(file, raw.replace(/"target"\s*:\s*"[^"]+"/i, '"target": "ES2022"'), "utf8");
}

/**
 * Zet de doorstuurregel in next.config.ts.
 *
 * `afterFiles` is hier het hele punt: Next kijkt eerst of hij zelf een pagina
 * heeft voor dit pad, en stuurt pas daarna door naar de hub. Zo zijn de
 * inlogschermen gewone pagina's van je app, terwijl /auth, /token en de rest
 * bij de hub terechtkomen - allemaal op dezelfde origin, dus de cookies kloppen.
 */
function patchNextConfig(target: string, mount: string, intern: number): void {
  const file = path.join(target, "next.config.ts");
  if (!fs.existsSync(file)) return;

  let src = fs.readFileSync(file, "utf8");
  if (src.includes("HUB_URL")) return;

  const blok = `
    /**
     * De OIDC-hub draait als eigen proces op ${intern} en is alleen via deze
     * regel bereikbaar - nooit rechtstreeks. Zo ziet je browser één origin.
     *
     * fallback en niet afterFiles: afterFiles draait wél na de gewone
     * bestanden, maar nog VOOR de dynamische routes - en de inlogschermen zijn
     * er een ([uid]). Die zou je dan nooit zien; alles ging naar de hub. In
     * fallback komt de hub pas aan bod als Next echt geen pagina heeft.
     */
    async rewrites() {
        return {
            beforeFiles: [],
            afterFiles: [],
            fallback: [
                { source: '${mount}/:path*', destination: \`\${HUB_URL}${mount}/:path*\` },
                // Inloggen op deze app zelf: /auth/start, /auth/callback,
                // /auth/me en /auth/logout draaien op dezelfde server als de hub.
                { source: '/auth/:path*', destination: \`\${HUB_URL}/auth/:path*\` }
            ]
        }
    },
`;

  src = src.replace(
    "const nextConfig: NextConfig = {",
    `/** Waar de hub luistert. In Docker zet compose deze variabele. */
const HUB_URL = process.env.HUB_URL ?? 'http://127.0.0.1:${intern}'

const nextConfig: NextConfig = {${blok}`,
  );

  fs.writeFileSync(file, src, "utf8");
}

/**
 * De startscripts van de hub.
 *
 * Express draait op tsx. NestJS niet: die heeft emitDecoratorMetadata nodig
 * voor zijn dependency injection, en dat kan esbuild - waar tsx op draait -
 * niet. Vandaar de gewone Nest-compiler, met een eigen tsconfig.build.json die
 * de Next-bestanden overslaat.
 */
function setHubScripts(target: string, hub: HubChoice, publiek: number): void {
  const file = path.join(target, "package.json");
  if (!fs.existsSync(file)) return;

  const pkg = JSON.parse(fs.readFileSync(file, "utf8")) as {
    type?: string;
    scripts?: Record<string, string>;
  };

  // create-next-app schrijft geen "type": "module", en dan draait tsx het
  // startbestand als CommonJS - waarop het valt over de top-level await in
  // src/index.ts. De hub is ESM, dus dit hoort erin.
  pkg.type = "module";

  const hubDev = hub.server === "nestjs" ? "nest start --watch" : "tsx watch src/index.ts";

  pkg.scripts = {
    ...pkg.scripts,
    // Eén commando, twee processen: Next vooraan op de publieke poort, de hub
    // erachter. --kill-others zorgt dat je er nooit eentje laat rondslingeren.
    dev: `concurrently --kill-others --names next,hub -c cyan,magenta "next dev -p ${publiek}" "${hubDev}"`,
    "dev:next": `next dev -p ${publiek}`,
    "dev:hub": hubDev,
    ...(hub.server === "nestjs" ? { "build:hub": "nest build" } : {}),
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

/**
 * De hub-app zijn eigen loginknop geven.
 *
 * Een hub-app deelt tokens uit, maar is ook gewoon een client van zichzelf: je
 * moet er kunnen inloggen. Dat gaat via dezelfde authorization code flow als
 * elke andere app — alleen blijft het verkeer binnen hetzelfde proces, dus is
 * er geen CORS nodig en wijst de callback naar de app zelf.
 *
 * De routes komen op /auth/*, naast de hub op /oidc/* en je eigen schermen op
 * de rest. Geen van drieën botst met de andere.
 */
export async function scaffoldHubAppClient(
  choice: OidcChoice,
  hub: HubChoice,
  projectDir: string,
  dir: string,
  pm: PackageManager,
  port: number,
): Promise<void> {
  if (choice.mode !== "new" || hub.mode !== "inapp") return;

  const target = path.join(projectDir, dir);
  p.log.step(`Inloggen op de app zelf opzetten in ./${dir} ...`);

  await withProgress(
    "OIDC-client installeren",
    async (update) => {
      // src/env.ts is van de hub en laadt dezelfde .env; die van de
      // clienttemplate zou hem overschrijven met een versie zonder zijn uitleg.
      preserving(target, [path.join("src", "env.ts")], () =>
        copyTemplate("oidc-client-express", target, {
          ISSUER: choice.issuer,
          CLIENT_ID: choice.clientId,
          CLIENT_SECRET: choice.clientSecret,
          BACKEND_PORT: port,
          FRONTEND_PORT: port,
        }),
      );

      if (choice.isAdminPanel) {
        copyTemplate("oidc-client-express-admin", target, {
          ISSUER: choice.issuer,
          CLIENT_ID: choice.clientId,
          CLIENT_SECRET: choice.clientSecret,
          BACKEND_PORT: port,
          FRONTEND_PORT: port,
        });
      }

      patchHubAppEntry(target, hub);

      mergeEnv(
        path.join(target, ".env"),
        [
          "# Inloggen op deze app zelf. Dezelfde hub, maar dan als client.",
          `OIDC_CLIENT_ID=${choice.clientId}`,
          `OIDC_CLIENT_SECRET=${choice.clientSecret}`,
          `OIDC_REDIRECT_URI=http://localhost:${port}/auth/callback`,
          `FRONTEND_URL=http://localhost:${port}`,
          "",
          "# Ondertekent de sessiecookie van deze app. Verzin een eigen waarde.",
          `SESSION_SECRET=${crypto.randomBytes(24).toString("hex")}`,
          "",
        ].join("\n"),
      );

      update("Pakketten installeren");
      await addDeps(pm, target, ["openid-client@latest", "cookie-session@latest"]);
      await addDevDeps(pm, target, ["@types/cookie-session@latest"]);
    },
    45000,
  );

  p.log.success(`Inloggen op ./${dir} staat klaar: /auth/start.`);
}

/**
 * Hangt de sessie en de auth-routes in het startbestand van de hub-app.
 *
 * Bewust vóór de hub-router: /auth/* is van de client, /oidc/* van de hub. Ze
 * delen wel de origin — en dat is precies waarom er geen CORS nodig is.
 */
function patchHubAppEntry(target: string, hub: HubChoice): void {
  const file = path.join(target, "src", hub.server === "nestjs" ? "main.ts" : "index.ts");
  if (!fs.existsSync(file)) return;

  let src = fs.readFileSync(file, "utf8");
  if (src.includes("authRouter")) return;

  const sessie = [
    "// Sessie van deze app zelf. Same-origin, dus geen CORS nodig.",
    "const session = cookieSession({",
    "    name: 'sid',",
    "    keys: [process.env.SESSION_SECRET ?? 'verander-mij'],",
    "    httpOnly: true,",
    "    sameSite: 'lax',",
    "    maxAge: 7 * 24 * 60 * 60 * 1000",
    "})",
    "",
  ].join("\n");

  if (hub.server === "nestjs") {
    src = src.replace(
      "import { NestFactory } from '@nestjs/core'",
      [
        "import { NestFactory } from '@nestjs/core'",
        "import cookieSession from 'cookie-session'",
        "import { authRouter } from './auth/routes.js'",
      ].join("\n"),
    );
    src = src.replace(
      "// Express slikt geen leeg mountpad, vandaar de val terug op de wortel.",
      sessie + "server.use(session)\nserver.use(authRouter)\n\n" +
        "// Express slikt geen leeg mountpad, vandaar de val terug op de wortel.",
    );
  } else {
    src = src.replace(
      "import express from 'express'",
      [
        "import express from 'express'",
        "import cookieSession from 'cookie-session'",
        "import { authRouter } from './auth/routes.js'",
      ].join("\n"),
    );
    src = src.replace(
      "// Express slikt geen leeg mountpad, vandaar de val terug op de wortel.",
      sessie + "app.use(session)\napp.use(authRouter)\n\n" +
        "// Express slikt geen leeg mountpad, vandaar de val terug op de wortel.",
    );
  }

  fs.writeFileSync(file, src, "utf8");
}

/**
 * Meldt deze app aan bij de bestaande hub.
 *
 * Zonder deze stap kent de hub je client_id niet en krijg je bij de eerste
 * login `invalid_client` - de meest voorkomende manier waarop een tweede app
 * stukloopt. Lukt het niet, dan krijg je het curl-commando om het zelf te doen;
 * we laten het scaffolden er niet op stoppen.
 */
/**
 * Het autorisatie-eindpunt van een hub, uit zijn eigen discovery.
 *
 * Niet zelf `${issuer}/auth` samenstellen: dat klopt toevallig voor onze hub,
 * maar niet voor elke OIDC-server.
 */
async function authorizationEndpoint(issuer: string): Promise<string | null> {
  try {
    const res = await fetch(`${issuer}/.well-known/openid-configuration`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { authorization_endpoint?: unknown };
    return typeof body.authorization_endpoint === "string" ? body.authorization_endpoint : null;
  } catch {
    return null;
  }
}

/**
 * Kent de hub deze client?
 *
 * We sturen een opzettelijk onvolledig autorisatieverzoek. De hub controleert
 * de client_id als eerste: kent hij hem niet, dan antwoordt hij 400 met
 * invalid_client; kent hij hem wel, dan struikelt hij pas over de rest. Zo
 * weten we het zonder token, zonder wachtwoord en zonder een halve inlogsessie
 * achter te laten.
 *
 * null = niet vast te stellen (hub onbereikbaar).
 */
async function clientKnown(issuer: string, clientId: string): Promise<boolean | null> {
  const endpoint = await authorizationEndpoint(issuer);
  if (!endpoint) return null;

  try {
    const url = new URL(endpoint);
    url.searchParams.set("client_id", clientId);
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5000) });
    if (res.status !== 400) return true;
    return !(await res.text()).includes("invalid_client");
  } catch {
    return null;
  }
}

export async function registerWithHub(
  choice: OidcChoice,
  backendPort: number,
  frontendPort: number,
): Promise<void> {
  if (choice.mode !== "existing") return;

  const body = {
    client_id: choice.clientId,
    client_secret: choice.clientSecret,
    name: choice.clientId,
    redirect_uris: [`http://localhost:${backendPort}/auth/callback`],
    post_logout_redirect_uris: [`http://localhost:${frontendPort}/`],
    allow_registration: choice.allowRegistration ?? false,
  };

  const url = `${choice.issuer}/admin/api/clients`;

  if (!choice.registrationToken) {
    p.log.warn(
      `Deze app is NIET aangemeld bij de hub - je gaf geen registratietoken.\n` +
        `Zonder dat kent de hub ${choice.clientId} niet en krijg je invalid_client.\n\n` +
        manualRegisterCommand(url, "<HUB_REGISTRATION_TOKEN>", body),
    );
    // Toch nakijken: misschien staat hij er al van een eerdere run. Zo niet,
    // dan zegt de waarschuwing hierboven het al - geen tweede keer hetzelfde.
    if ((await clientKnown(choice.issuer, choice.clientId)) === true) {
      p.log.success(`Toch goed: de hub kent ${choice.clientId} al van eerder.`);
    }
    return;
  }

  p.log.step(`Deze app aanmelden bij ${choice.issuer} ...`);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${choice.registrationToken}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`HTTP ${response.status} ${details.slice(0, 200)}`);
    }

    p.log.success(
      `Aangemeld als ${choice.clientId}` +
        (choice.allowRegistration ? " (mag accounts aanmaken)." : " (geen registratie)."),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    p.log.warn(
      `Aanmelden bij de hub is niet gelukt: ${message}\n` +
        `Draait hij, en klopt de URL? Anders zelf:\n\n` +
        manualRegisterCommand(url, choice.registrationToken, body),
    );
  }

  await assertClientKnown(choice, url, body);
}

/**
 * Controleert bij de hub zelf of hij deze app nu echt kent.
 *
 * Het aanmelden kan op vier manieren stilletjes mislukken - geen token, een
 * verkeerd token, een hub die niet draaide, of een hub die naar een andere
 * database kijkt - en in alle vier de gevallen merk je het pas bij je eerste
 * login, als `invalid_client`. Deze controle haalt dat naar voren.
 */
async function assertClientKnown(
  choice: OidcChoice,
  url: string,
  body: object,
): Promise<void> {
  const bekend = await clientKnown(choice.issuer, choice.clientId);

  if (bekend === null) {
    p.log.warn(
      `Kon bij ${choice.issuer} niet nakijken of ${choice.clientId} bekend is -\n` +
        "de hub antwoordde niet. Start hem en probeer daarna in te loggen.",
    );
    return;
  }

  if (bekend) {
    p.log.success(`De hub kent ${choice.clientId}.`);
    return;
  }

  p.log.error(
    `De hub kent ${choice.clientId} NIET. Je eerste login geeft dan invalid_client.\n` +
      "Meld deze app alsnog aan met het token uit de .env van de hub:\n\n" +
      manualRegisterCommand(url, choice.registrationToken || "<HUB_REGISTRATION_TOKEN>", body),
  );
}

/** Het commando om het met de hand te doen. */
function manualRegisterCommand(url: string, token: string, body: object): string {
  return (
    `curl -X POST ${url} \\\n` +
    `  -H "authorization: Bearer ${token}" \\\n` +
    `  -H "content-type: application/json" \\\n` +
    `  -d '${JSON.stringify(body)}'`
  );
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

/**
 * Hangt de auth-routes opnieuw in de backend.
 *
 * De databasevraag komt bewust laat - je ziet dan waar je "ja" tegen zegt -
 * maar die stap zet src/index.ts (Express) en app.module.ts (Nest) opnieuw
 * neer, inclusief het wegvallen van de bedrading die de OIDC-stap er net in
 * had gezet. Het gevolg is een backend waar alle auth-bestanden staan en die
 * toch 404 antwoordt op /auth/start. Vandaar deze herstelstap.
 *
 * Beide patchfuncties zijn idempotent, dus twee keer draaien kan geen kwaad.
 */
export function rewireBackendAuth(
  choice: OidcChoice,
  backend: Backend,
  projectDir: string,
): void {
  if (choice.mode === "none" || backend === "none") return;

  const target = path.join(projectDir, BACKEND_DIR);
  if (!fs.existsSync(target)) return;

  if (backend === "node") patchExpressEntry(target);
  else patchNestModule(target);
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
  /** Waar de frontend staat. Bij een hub-app is dat ./app. */
  dir: string = FRONTEND_DIR,
): void {
  if (choice.mode === "none") return;
  if (frontend === "none") {
    p.log.warn("Geen frontend gekozen — de loginpagina wordt overgeslagen.");
    return;
  }

  const target = path.join(projectDir, dir);
  const vars = { BACKEND_URL: `http://localhost:${backendPort}` };

  copyTemplate("oidc-frontend", target, vars);
  if (choice.isAdminPanel) copyTemplate("oidc-frontend-admin", target, vars);

  writeFrontendEnv(target, backendPort);
  mergeMessages(target, choice.isAdminPanel);
  patchProxy(target, choice.isAdminPanel);
  patchHomePage(target);

  p.log.success(
    `Loginpagina${choice.isAdminPanel ? " en beheerscherm" : ""} toegevoegd aan ./${dir}.`,
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
  /** Waar de hub staat: ./oidc, of ./app bij een hub-app. */
  dir: string = OIDC_DIR,
  projectName = "Hub",
  /** De callback-URL van de app van de hub zelf. */
  ownRedirectUri = `http://localhost:${BACKEND_PORT}/auth/callback`,
  ownPostLogoutUri = `http://localhost:${FRONTEND_PORT}/`,
): Promise<void> {
  if (choice.mode !== "new" || database === "none") return;

  const target = path.join(projectDir, dir);
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
      // De databaseversie van clients.ts zet de eigen app in de tabel; die
      // heeft dezelfde gegevens nodig als de statische variant.
      copyTemplate("oidc-db", target, {
        CLIENT_ID: choice.clientId,
        CLIENT_SECRET: choice.clientSecret,
        PROJECT_NAME: projectName,
        ACCENT: "#0f9d58",
        TAGLINE: "Centrale login",
        OWN_REDIRECT_URI: ownRedirectUri,
        OWN_POST_LOGOUT_URI: ownPostLogoutUri,
      });
    },
    35000,
  );

  p.log.success(`OIDC-hub gebruikt nu ${databaseLabel(database)}.`);
}
