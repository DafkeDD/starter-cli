import { runQuiet } from "./exec.js";
import type { PackageManager } from "../types.js";

/** Installeert dev-dependencies in `cwd` met de gekozen package manager. */
export async function addDevDeps(
  pm: PackageManager,
  cwd: string,
  packages: string[],
): Promise<void> {
  if (packages.length === 0) return;

  const args =
    pm === "npm"
      ? ["install", "--save-dev", ...packages]
      : pm === "pnpm"
        ? ["add", "-D", ...packages]
        : ["add", "-D", ...packages];

  await runQuiet(pm, args, cwd);
}

/** Installeert (gewone) dependencies in `cwd`. */
export async function addDeps(
  pm: PackageManager,
  cwd: string,
  packages: string[],
): Promise<void> {
  if (packages.length === 0) return;

  const args = pm === "npm" ? ["install", ...packages] : ["add", ...packages];
  await runQuiet(pm, args, cwd);
}
