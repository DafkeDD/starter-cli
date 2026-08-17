import { spawn } from "node:child_process";

/**
 * Op Windows draaien we via de shell (zodat `npx`/`npm`/`git` als .cmd worden
 * gevonden). De shell plakt argumenten echter aan elkaar zonder te quoten,
 * waardoor een argument met een spatie (bv. een pad met spatie) opsplitst.
 * Daarom quoten we die argumenten zelf.
 */
const USE_SHELL = process.platform === "win32";

function quoteArg(arg: string): string {
  // Veilige tekens (geen spatie/speciale shell-tekens) -> niet quoten.
  if (/^[A-Za-z0-9._\-:/\\@=*]+$/.test(arg)) return arg;
  return `"${arg.replace(/(["\\])/g, "\\$1")}"`;
}

function prepareArgs(args: string[]): string[] {
  return USE_SHELL ? args.map(quoteArg) : args;
}

/** Voert een commando uit en toont de output rechtstreeks in de console. */
export function run(
  command: string,
  args: string[],
  cwd: string = process.cwd(),
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, prepareArgs(args), {
      cwd,
      stdio: "inherit",
      shell: USE_SHELL,
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`\`${command} ${args.join(" ")}\` faalde (exit code ${code}).`));
    });
  });
}

/**
 * Zoals `run`, maar zonder output op de console (stdout genegeerd, stderr
 * opgevangen voor foutmeldingen). Handig samen met een eigen progress-bar,
 * zodat npm-output de bar niet verstoort.
 */
export function runQuiet(
  command: string,
  args: string[],
  cwd: string = process.cwd(),
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, prepareArgs(args), {
      cwd,
      stdio: ["ignore", "ignore", "pipe"],
      shell: USE_SHELL,
    });

    let stderr = "";
    child.stderr?.on("data", (d) => {
      stderr += String(d);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        const tail = stderr.trim().split("\n").slice(-8).join("\n");
        reject(
          new Error(
            `\`${command} ${args.join(" ")}\` faalde (exit code ${code}).${tail ? "\n" + tail : ""}`,
          ),
        );
      }
    });
  });
}
