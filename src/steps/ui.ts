import path from "node:path";
import * as p from "@clack/prompts";
import { addDeps } from "../utils/install.js";
import { withProgress } from "../utils/progress.js";
import { FRONTEND_DIR } from "./frontend.js";
import type { Frontend } from "./frontend.js";
import type { PackageManager } from "../types.js";

/**
 * De eigen componentenbibliotheek. Eén plek voor layout, knoppen, dropdowns —
 * zodat elke app er hetzelfde uitziet. Kleuren en logo stel je per app in via
 * de design tokens in globals.css.
 */
export const UI_PACKAGE = "github:DafkeDD/projectx-ui";

/**
 * Vraag 2: de eigen UI-bibliotheek installeren?
 * Wordt alleen gesteld als er een frontend is.
 */
export async function askCustomUi(frontend: Frontend): Promise<boolean> {
  if (frontend === "none") return false;

  const answer = await p.confirm({
    message: "Wil je onze custom UI installeren?",
    initialValue: true,
  });
  if (p.isCancel(answer)) {
    p.cancel("Geannuleerd.");
    process.exit(0);
  }

  return answer;
}

/**
 * Installeert de UI-bibliotheek in de frontend.
 *
 * Mislukt dat — repo privé, geen toegang, geen netwerk — dan stopt de CLI niet:
 * je project is verder gewoon bruikbaar en je krijgt het commando om het later
 * zelf te doen.
 */
export async function scaffoldCustomUi(
  wanted: boolean,
  frontend: Frontend,
  projectDir: string,
  pm: PackageManager,
  pkg: string = UI_PACKAGE,
): Promise<void> {
  if (!wanted || frontend === "none") return;

  const target = path.join(projectDir, FRONTEND_DIR);
  p.log.step(`Custom UI installeren in ./${FRONTEND_DIR} ...`);

  try {
    await withProgress(
      "Custom UI installeren",
      async () => {
        await addDeps(pm, target, [pkg]);
      },
      20000,
    );
    p.log.success(`Custom UI geïnstalleerd (${pkg}).`);
  } catch (err) {
    p.log.warn(
      `Custom UI installeren is niet gelukt: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}\n` +
        "Is de repo privé, log dan in met 'gh auth login' of zet een SSH-sleutel klaar.\n" +
        `Later alsnog installeren:\n  cd ${FRONTEND_DIR} && ${pm} install ${pkg}`,
    );
  }
}
