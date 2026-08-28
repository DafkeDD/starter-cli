import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Databasenamen kiezen zodat je meerdere projecten naast elkaar kan draaien.
 *
 * Hetzelfde probleem als bij de poorten, maar dan erger: draai je PostgreSQL
 * zelf, dan delen ALLE projecten een server. Twee projecten met een database
 * "app" en een rol "app" is geen tweede database - het is hetzelfde project dat
 * over zichzelf heen schrijft.
 *
 * Daarom krijgt elk project een eigen nummer: app01, app02, app03. De rol heet
 * net zo als de database, met een eigen wachtwoord - dus niet meer de superuser
 * "postgres".
 *
 * De hub schuift NIET mee. Daar draait er maar een van, gedeeld door al je
 * apps, precies zoals hij ook gewoon op poort 9000 blijft staan. Zijn database
 * heet dus "oidc" - zonder nummer. Alleen als je toch een tweede hub bouwt
 * schuift die op naar oidc02, want anders zouden twee hubs op dezelfde lokale
 * server dezelfde gebruikerstabel delen.
 *
 * Het nummer ligt vast in ~/.starter-cli/databases.json. Projecten waarvan de
 * map niet meer bestaat geven hun nummer terug, zodat het niet eindeloos oploopt.
 */
export interface DbCredentials {
  /** 1, 2, 3 ... */
  slot: number;
  /** De rol waarmee de app inlogt. Gelijk aan de naam van zijn database. */
  user: string;
  password: string;
  /** Database van de backend. */
  appDb: string;
  /**
   * Kwam hier iets uit een .env die er al stond?
   *
   * Zo ja, dan valt er niets meer te kiezen: mergeEnv laat bestaande sleutels
   * staan, dus een ander antwoord zou toch niet in het bestand belanden.
   */
  existing: boolean;
  /**
   * Database van de OIDC-hub. Zelfde rol, andere database.
   *
   * Heet "oidc", zonder projectnummer: er is er maar een.
   */
  oidcDb: string;
}

const PREFIX = "app";
const OIDC_NAME = "oidc";
const REGISTRY_DIR = path.join(os.homedir(), ".starter-cli");
const REGISTRY_FILE = path.join(REGISTRY_DIR, "databases.json");

type Registry = Record<string, { slot: number; oidcDb?: string }>;

/** app1 -> app01, app12 -> app12, app123 -> app123. */
export function nameForSlot(slot: number): string {
  return `${PREFIX}${String(slot).padStart(2, "0")}`;
}

/**
 * De naam, de rol en het wachtwoord voor dit project.
 *
 * Wat er al in een .env staat wint altijd. Scaffold je dezelfde map opnieuw,
 * dan krijg je dus exact hetzelfde terug - naam, rol en wachtwoord. Dat moet
 * wel: mergeEnv laat bestaande sleutels staan, dus zou de CLI hier iets nieuws
 * verzinnen, dan maakt hij een rol aan die niet in je .env staat.
 *
 * Alleen als er nog niets is, valt hij terug op het nummer van dit project.
 */
export function resolveDbCredentials(projectDir: string, ownHub = false): DbCredentials {
  const { slot, oidcDb } = resolveNames(projectDir, ownHub);
  const fallback = nameForSlot(slot);

  const user = envValue(projectDir, ["backend", "oidc"], "DB_USER");
  const password = envValue(projectDir, ["backend", "oidc"], "DB_PASSWORD");
  const appDb = envValue(projectDir, ["backend"], "DB_NAME");
  const fromEnv = envValue(projectDir, ["oidc"], "DB_NAME");

  return {
    slot,
    existing: Boolean(user ?? password ?? appDb ?? fromEnv),
    user: user ?? fallback,
    password: password ?? generatePassword(),
    appDb: appDb ?? fallback,
    oidcDb: fromEnv ?? oidcDb,
  };
}

/**
 * Legt vast welke naam de hub uiteindelijk kreeg.
 *
 * Kies je zelf een naam, dan moet het register die kennen - anders krijgt een
 * volgende hub dezelfde naam voorgesteld.
 */
export function rememberOidcDb(projectDir: string, oidcDb: string): void {
  const registry = readRegistry();
  const entry = registry[projectDir];
  if (!entry) return;

  registry[projectDir] = { ...entry, oidcDb };
  writeRegistry(registry);
}

/**
 * Het nummer van dit project en de naam voor zijn hub.
 *
 * @param ownHub Bouwt dit project zelf een hub? Zo niet, dan legt het ook geen
 *   beslag op de naam - anders zou het volgende project oidc02 krijgen voor een
 *   hub die het niet eens heeft. Zelfde redenering als bij poort 9000.
 */
function resolveNames(projectDir: string, ownHub: boolean): { slot: number; oidcDb: string } {
  const registry = readRegistry();

  // Verdwenen projecten geven hun nummer terug.
  for (const dir of Object.keys(registry)) {
    if (dir !== projectDir && !fs.existsSync(dir)) delete registry[dir];
  }

  const known = registry[projectDir]?.slot;
  const taken = new Set(
    Object.entries(registry)
      .filter(([dir]) => dir !== projectDir)
      .map(([, entry]) => entry.slot),
  );

  let slot = known;
  if (slot === undefined || taken.has(slot)) {
    slot = 1;
    while (taken.has(slot)) slot++;
  }

  // De hub houdt gewoon "oidc". Alleen als een ander project die naam al
  // gebruikt, schuift deze op.
  const usedOidc = new Set(
    Object.entries(registry)
      .filter(([dir]) => dir !== projectDir)
      .map(([, entry]) => entry.oidcDb)
      .filter((name): name is string => Boolean(name)),
  );

  let oidcDb = registry[projectDir]?.oidcDb ?? OIDC_NAME;
  if (usedOidc.has(oidcDb)) {
    let n = 2;
    while (usedOidc.has(`${OIDC_NAME}${String(n).padStart(2, "0")}`)) n++;
    oidcDb = `${OIDC_NAME}${String(n).padStart(2, "0")}`;
  }

  registry[projectDir] = { slot, ...(ownHub ? { oidcDb } : {}) };
  writeRegistry(registry);

  return { slot, oidcDb };
}

/**
 * Een waarde die een eerdere run al in een .env schreef.
 *
 * De backend en de hub delen de rol en het wachtwoord, dus daarvoor kijken we
 * in allebei. De databasenaam verschilt per app, dus die zoeken we alleen in de
 * map van die app zelf.
 */
function envValue(projectDir: string, dirs: string[], key: string): string | undefined {
  for (const dir of dirs) {
    const file = path.join(projectDir, dir, ".env");
    if (!fs.existsSync(file)) continue;

    const match = new RegExp(`^${key}=(.*)$`, "m").exec(fs.readFileSync(file, "utf8"));
    const value = match?.[1]?.trim();
    if (value) return value;
  }

  return undefined;
}

function readRegistry(): Registry {
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_FILE, "utf8")) as Registry;
  } catch {
    return {};
  }
}

function writeRegistry(registry: Registry): void {
  try {
    fs.mkdirSync(REGISTRY_DIR, { recursive: true });
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2) + "\n", "utf8");
  } catch {
    // Geen schrijfrechten in de thuismap: dan onthouden we het niet, meer niet.
  }
}

/** Een stevig wachtwoord voor de database: 19 tekens, vier tekenklassen. */
export function generatePassword(): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  // Bewust een krappe set. Weggelaten en waarom:
  //   #  Node kapt de waarde daar af bij het lezen van .env, Docker niet - dan
  //      maak je een container met wachtwoord "Aa1#Bb2" terwijl je app "Aa1"
  //      gebruikt, en krijg je "password authentication failed".
  //   $  Docker Compose ziet dat als een variabele om in te vullen.
  //   %  cmd.exe op Windows vult %NAAM% in.
  //   &  scheidt commando's in cmd.exe.
  //   '  breekt de string in het CREATE ROLE ... PASSWORD '...' statement.
  const symbols = "*+-=?_";

  const pick = (from: string, count: number): string[] =>
    Array.from({ length: count }, () => from[crypto.randomInt(from.length)]!);

  const characters = [
    ...pick(upper, 3),
    ...pick(alphabet, 10),
    ...pick(digits, 4),
    ...pick(symbols, 2),
  ];

  // Fisher-Yates met crypto, zodat de posities van de tekenklassen niet vastliggen.
  for (let i = characters.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [characters[i], characters[j]] = [characters[j]!, characters[i]!];
  }

  return characters.join("");
}
