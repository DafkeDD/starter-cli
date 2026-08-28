import { spawn } from "node:child_process";

/**
 * Op Windows draaien we via de shell, want npm, npx en git zijn daar .cmd-
 * bestanden en die kan spawn niet rechtstreeks starten.
 *
 * De argumenten geven we dan NIET als array mee. Node waarschuwt daarvoor sinds
 * versie 24 (DEP0190): met shell: true plakt hij de array ongequoot achter het
 * commando, en dan splitst een pad met een spatie alsnog op. In plaats daarvan
 * bouwen we de commandoregel zelf en quoten we zelf - dan weten we ook zeker
 * volgens welke regels.
 */
const USE_SHELL = process.platform === "win32";

/**
 * Quoten volgens de regels van cmd.exe.
 *
 * Let op het verschil met een unix-shell: cmd kent geen backslash-escapes. Een
 * dubbele quote binnen een gequote string verdubbel je, en backslashes laat je
 * met rust - dat zijn daar padscheidingen. Ze toch escapen maakte van
 * C:\Mijn Map een C:\\Mijn Map.
 */
function quoteArg(arg: string): string {
  // Veilige tekens (geen spatie of shell-teken) -> niet quoten.
  if (/^[A-Za-z0-9._\-:/\\@=*]+$/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '""')}"`;
}

/** Het commando zoals we het aan de shell geven: één regel, zelf gequote. */
function commandLine(command: string, args: string[]): string {
  return [command, ...args].map(quoteArg).join(" ");
}

/** Voert een commando uit en toont de output rechtstreeks in de console. */
export function run(
  command: string,
  args: string[],
  cwd: string = process.cwd(),
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = USE_SHELL
      ? spawn(commandLine(command, args), { cwd, stdio: "inherit", shell: true })
      : spawn(command, args, { cwd, stdio: "inherit" });

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
    const child = USE_SHELL
      ? spawn(commandLine(command, args), { cwd, stdio: ["ignore", "ignore", "pipe"], shell: true })
      : spawn(command, args, { cwd, stdio: ["ignore", "ignore", "pipe"] });

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
