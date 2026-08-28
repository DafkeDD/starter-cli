import { execFile } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Poorten kiezen zodat je meerdere projecten naast elkaar kan draaien.
 *
 * Het probleem: elk gegenereerd project zet zijn poort vast in de code (harde
 * regel: geen env-override). Scaffold je een tweede project, dan botsen ze -
 * de backend valt om met EADDRINUSE en `docker compose up` weigert de database
 * omdat de poort al bezet is.
 *
 * Alleen kijken of een poort nu vrij is, is niet genoeg: draait project 1 net
 * niet, dan lijkt 5000 vrij en krijgt project 2 hem alsnog. Daarom houdt de CLI
 * ook bij welke poorten hij eerder heeft uitgedeeld, in
 * ~/.starter-cli/ports.json. Projecten waarvan de map niet meer bestaat tellen
 * niet mee, zodat de nummers niet eindeloos oplopen.
 */
export interface Ports {
  frontend: number;
  backend: number;
  oidc: number;
  /**
   * Host-poort van de database.
   *
   * Er is er EEN per project. De backend en de OIDC-hub delen dezelfde
   * container en hebben daarin elk hun eigen database - vandaar het initscript
   * dat de tweede aanmaakt. Twee poorten zou twee containers betekenen, en die
   * zijn er niet.
   */
  db: number;
}

export type PortName = keyof Ports;

/**
 * Waar we het liefst op uitkomen. Het eerste project krijgt precies dit.
 *
 * De database publiceert BEWUST niet op 5432. Dat is de drukste poort op een
 * ontwikkelmachine: een eerder geinstalleerde PostgreSQL, een container van een
 * ander project, of - op Windows - een poortreeks die Hyper-V en WSL voor
 * zichzelf reserveren en waar dan niets meer bij kan, terwijl je in geen enkele
 * processenlijst iets ziet staan.
 *
 * In de container luistert PostgreSQL gewoon op 5432; alleen de poort op je
 * eigen machine is anders. Verbind je met pgAdmin of DBeaver, gebruik dan de
 * poort die in .env staat.
 */
export const DEFAULT_PORTS: Ports = {
  frontend: 3000,
  backend: 5000,
  oidc: 9000,
  db: 55432,
};

const REGISTRY_DIR = path.join(os.homedir(), ".starter-cli");
const REGISTRY_FILE = path.join(REGISTRY_DIR, "ports.json");

/** Hoeveel plekken we opschuiven voor we het opgeven. */
const MAX_STEPS = 100;

/**
 * Per project alleen de poorten die het echt gebruikt.
 *
 * Dat is belangrijk voor de OIDC-hub: die draait er maar een, gedeeld door al
 * je apps. Sluit een project aan op een bestaande hub, dan claimt het geen
 * hub-poort - anders zou het volgende project 9001 krijgen voor een hub die
 * helemaal niet bestaat.
 */
type Registry = Record<string, Partial<Ports>>;

/**
 * Is deze poort vrij?
 *
 * Twee controles, want een ervan alleen is niet genoeg:
 *
 *  - Kunnen we hem zelf openen? Vangt het gewone geval.
 *  - Antwoordt er iets als we verbinden? Vangt het geval waar iets anders al
 *    luistert maar het openen tóch lukt. Dat kan gebeuren met poorten die door
 *    Docker Desktop worden doorgegeven: die worden op een andere manier
 *    vastgehouden dan door een gewoon proces.
 */
async function isFree(port: number): Promise<boolean> {
  if (await somethingAnswers(port)) return false;
  return canBind(port);
}

/** Kunnen we zelf op deze poort gaan luisteren? */
function canBind(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "0.0.0.0");
  });
}

/** Neemt iets de verbinding aan op deze poort? */
function somethingAnswers(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    const done = (answered: boolean) => {
      socket.destroy();
      resolve(answered);
    };

    socket.setTimeout(400);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

/**
 * Host-poorten die Docker al voor zichzelf heeft opgeeist.
 *
 * Ook van GESTOPTE containers, en dat is het punt: de gegenereerde compose
 * gebruikt `restart: unless-stopped`, dus die containers komen vanzelf terug
 * zodra Docker Desktop start. Stond zo'n container even uit toen jij
 * scaffoldde, dan leek de poort vrij en botste je er later alsnog op met
 * "port is already allocated".
 *
 * Geen Docker geinstalleerd? Dan levert dit gewoon niets op.
 */
async function dockerClaimedPorts(): Promise<Set<number>> {
  const claimed = new Set<number>();

  try {
    const ids = await docker(["ps", "-a", "--format", "{{.ID}}"]);
    const containers = ids.split(/\r?\n/).filter(Boolean);
    if (containers.length === 0) return claimed;

    const stdout = await docker([
      "inspect",
      "--format",
      "{{range $port, $binding := .HostConfig.PortBindings}}{{range $binding}}{{.HostPort}} {{end}}{{end}}",
      ...containers,
    ]);

    for (const match of stdout.matchAll(/\d+/g)) {
      claimed.add(Number(match[0]));
    }
  } catch {
    // Docker draait niet of staat er niet: dan is er ook niets te claimen.
  }

  return claimed;
}

/**
 * Draait `docker ...` en geeft de uitvoer terug.
 *
 * Op Windows heet het docker.exe en niet docker.cmd, dus hier is geen shell
 * nodig. Dat scheelt ook de waarschuwing die Node sinds versie 24 geeft als je
 * een argumentenlijst met shell: true combineert (DEP0190) - en belangrijker:
 * zonder shell komt het format-argument met zijn accolades en spaties gewoon
 * ongeschonden aan.
 */
async function docker(args: string[]): Promise<string> {
  const { stdout } = await run("docker", args, { timeout: 10000 });
  return stdout;
}

/** Leest het register. Stuk of afwezig? Dan beginnen we gewoon leeg. */
function readRegistry(): Registry {
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_FILE, "utf8")) as Registry;
  } catch {
    return {};
  }
}

/** Schrijft het register. Lukt dat niet, dan is dat geen reden om te stoppen. */
function writeRegistry(registry: Registry): void {
  try {
    fs.mkdirSync(REGISTRY_DIR, { recursive: true });
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2) + "\n", "utf8");
  } catch {
    // Geen schrijfrechten in de thuismap: dan onthouden we het niet, meer niet.
  }
}

/**
 * Kiest de poorten voor dit project en legt ze vast.
 *
 * Scaffold je dezelfde map opnieuw, dan krijg je dezelfde poorten terug.
 */
export async function resolvePorts(projectDir: string, needed: PortName[]): Promise<Ports> {
  const registry = readRegistry();

  // Verdwenen projecten geven hun poorten terug.
  for (const dir of Object.keys(registry)) {
    if (dir !== projectDir && !fs.existsSync(dir)) delete registry[dir];
  }

  // Alles wat andere projecten al claimen, plus wat Docker al vastheeft.
  const claimed = await dockerClaimedPorts();
  for (const [dir, ports] of Object.entries(registry)) {
    if (dir === projectDir) continue;
    for (const port of Object.values(ports)) claimed.add(port);
  }

  // Kennen we deze map al? Dan houden we zijn poorten, ook al lijken ze nu
  // bezet - dat is dit project zelf dat draait. Opnieuw scaffolden mag de
  // poorten niet verschuiven, want dan kloppen de URL's in .env en in de
  // OIDC-client niet meer.
  const previous = registry[projectDir] ?? {};

  // Onderdelen die dit project niet heeft, houden de standaardwaarde. Ze worden
  // nergens gebruikt en worden ook niet vastgelegd.
  const ports: Ports = { ...DEFAULT_PORTS };
  const entry: Partial<Ports> = {};

  for (const name of needed) {
    const earlier = previous[name];
    const port =
      earlier !== undefined && !claimed.has(earlier)
        ? earlier
        : await pick(DEFAULT_PORTS[name], claimed);

    claimed.add(port);
    ports[name] = port;
    entry[name] = port;
  }

  registry[projectDir] = entry;
  writeRegistry(registry);

  return ports;
}

/** De eerste poort vanaf `start` die niemand claimt en die ook echt vrij is. */
async function pick(start: number, claimed: Set<number>): Promise<number> {
  for (let port = start; port < start + MAX_STEPS; port++) {
    if (claimed.has(port)) continue;
    if (await isFree(port)) return port;
  }

  throw new Error(
    `Geen vrije poort gevonden tussen ${start} en ${start + MAX_STEPS}.\n` +
      "Sluit wat er draait af, of pas DEFAULT_PORTS aan in src/utils/ports.ts.",
  );
}

/** Verschilt een van de gebruikte poorten van de standaard? */
export function isShifted(ports: Ports, needed: PortName[]): boolean {
  return needed.some((name) => ports[name] !== DEFAULT_PORTS[name]);
}
