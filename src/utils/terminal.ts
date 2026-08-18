import { spawn, spawnSync } from "node:child_process";

/**
 * Opent een nieuw terminalvenster dat `command` uitvoert in `cwd`.
 * Het venster blijft openstaan zodat je de dev-server ziet draaien.
 *
 * @returns true als er een venster gestart kon worden.
 */
export function openTerminal(title: string, cwd: string, command: string): boolean {
  try {
    if (process.platform === "win32") {
      // `start ""` -> de lege string is de venstertitel; zonder die lege string
      // ziet cmd het eerste woord aan voor het commando.
      // `title X & ...` zet daarna alsnog een leesbare venstertitel.
      spawn("cmd", ["/c", "start", "", "cmd", "/k", `title ${title} & ${command}`], {
        cwd,
        detached: true,
        stdio: "ignore",
      }).unref();
      return true;
    }

    if (process.platform === "darwin") {
      const script = `tell application "Terminal" to do script "cd ${quoteForShell(cwd)} && ${command}"`;
      spawn("osascript", ["-e", script], { detached: true, stdio: "ignore" }).unref();
      return true;
    }

    // Linux: de eerste terminal-emulator die bestaat.
    for (const term of ["x-terminal-emulator", "gnome-terminal", "konsole", "xfce4-terminal", "xterm"]) {
      if (!commandExists(term)) continue;
      const args =
        term === "gnome-terminal"
          ? ["--", "bash", "-lc", `${command}; exec bash`]
          : ["-e", `bash -lc "${command}; exec bash"`];
      spawn(term, args, { cwd, detached: true, stdio: "ignore" }).unref();
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/** Opent een URL in de standaardbrowser. */
export function openBrowser(url: string): void {
  try {
    if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    } else if (process.platform === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    }
  } catch {
    // Geen browser kunnen openen is niet erg — de URL staat ook in de output.
  }
}

function quoteForShell(value: string): string {
  return value.replace(/(["\\$`])/g, "\\$1");
}

/** True als `name` op het PATH staat. */
function commandExists(name: string): boolean {
  try {
    return spawnSync("which", [name], { stdio: "ignore" }).status === 0;
  } catch {
    return false;
  }
}
