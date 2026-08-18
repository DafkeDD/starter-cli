import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import { runQuiet } from "../utils/exec.js";
import { withProgress } from "../utils/progress.js";

export interface GithubChoice {
  /** Of er een repo op GitHub aangemaakt en gepusht moet worden. */
  useGithub: boolean;
  /** Naam van het project — wordt ook de naam van de repo. */
  projectName: string;
  isPrivate: boolean;
}

/**
 * Vraag 3: GitHub gebruiken?
 * Bij "ja" volgt de projectnaam — die naam krijgt de repo op GitHub ook.
 */
export async function askGithub(defaultName: string): Promise<GithubChoice> {
  const use = await p.confirm({
    message: "Wil je GitHub gebruiken?",
    initialValue: true,
  });
  if (p.isCancel(use)) {
    p.cancel("Geannuleerd.");
    process.exit(0);
  }

  if (!use) {
    return { useGithub: false, projectName: defaultName, isPrivate: true };
  }

  const name = await p.text({
    message: "Hoe wil je het project noemen?",
    placeholder: defaultName,
    defaultValue: defaultName,
    validate: (value) => {
      const v = (value ?? "").trim();
      if (!v) return undefined; // leeg -> defaultValue
      if (!/^[A-Za-z0-9._-]+$/.test(v)) {
        return "Enkel letters, cijfers, '.', '_' of '-' (GitHub-repo-naam).";
      }
      return undefined;
    },
  });
  if (p.isCancel(name)) {
    p.cancel("Geannuleerd.");
    process.exit(0);
  }

  const visibility = await p.select({
    message: "Moet de repo privé of openbaar zijn?",
    initialValue: "private" as "private" | "public",
    options: [
      { value: "private" as const, label: "Privé" },
      { value: "public" as const, label: "Openbaar" },
    ],
  });
  if (p.isCancel(visibility)) {
    p.cancel("Geannuleerd.");
    process.exit(0);
  }

  return {
    useGithub: true,
    projectName: String(name).trim() || defaultName,
    isPrivate: visibility === "private",
  };
}

/** Maakt de repo aan op GitHub (met de projectnaam) en pusht de code. */
export async function pushToGithub(choice: GithubChoice, projectDir: string): Promise<void> {
  if (!choice.useGithub) return;

  if (!(await checkGh())) {
    p.log.warn(
      "GitHub CLI (gh) niet gevonden of niet ingelogd — repo niet aangemaakt.\n" +
        "Installeer met 'winget install --id GitHub.cli' en log in met 'gh auth login'.\n" +
        manualSteps(choice),
    );
    return;
  }

  writeRootFiles(projectDir, choice.projectName);
  // Generators maken soms een eigen .git in een submap; die weg, anders
  // committeert git ze als lege "embedded repository".
  removeNestedGitDirs(projectDir);

  p.log.step(
    `Repo '${choice.projectName}' aanmaken op GitHub (${choice.isPrivate ? "privé" : "openbaar"}) en pushen ...`,
  );

  try {
    await withProgress(
      "Git-repo voorbereiden",
      async (update) => {
        await runQuiet("git", ["init"], projectDir);
        await runQuiet("git", ["add", "."], projectDir);

        if (!(await hasStagedChanges(projectDir))) {
          throw new Error("Niets om te committen.");
        }

        // Fallback-identiteit als git nog geen user.name/user.email heeft.
        const idArgs = (await hasGitIdentity(projectDir))
          ? []
          : [
              "-c",
              "user.name=starter-cli",
              "-c",
              "user.email=starter-cli@users.noreply.github.com",
            ];

        await runQuiet("git", [...idArgs, "commit", "-m", "Initial commit"], projectDir);
        try {
          await runQuiet("git", ["branch", "-M", "main"], projectDir);
        } catch {
          // branch bestaat al als main
        }
        try {
          // Een bestaande origin zou 'gh repo create --remote=origin' laten falen.
          await runQuiet("git", ["remote", "remove", "origin"], projectDir);
        } catch {
          // er was nog geen origin
        }

        update(`Repo '${choice.projectName}' aanmaken en pushen`);
        await runQuiet(
          "gh",
          [
            "repo",
            "create",
            choice.projectName,
            choice.isPrivate ? "--private" : "--public",
            "--source=.",
            "--remote=origin",
            "--push",
          ],
          projectDir,
        );
      },
      20000,
    );

    p.log.success(`Repo aangemaakt en gepusht: ${choice.projectName}`);
  } catch (err) {
    p.log.warn(
      `Pushen naar GitHub is niet gelukt: ${err instanceof Error ? err.message : String(err)}\n` +
        manualSteps(choice),
    );
  }
}

/** Handmatige commando's, voor als gh ontbreekt of faalt. */
function manualSteps(choice: GithubChoice): string {
  return [
    "Handmatig:",
    "  git init && git add . && git commit -m \"Initial commit\"",
    "  git branch -M main",
    `  gh repo create ${choice.projectName} ${choice.isPrivate ? "--private" : "--public"} --source=. --remote=origin --push`,
  ].join("\n");
}

/** Controleert of de gh CLI beschikbaar en ingelogd is. */
async function checkGh(): Promise<boolean> {
  try {
    await runQuiet("gh", ["--version"]);
    await runQuiet("gh", ["auth", "status"]);
    return true;
  } catch {
    return false;
  }
}

/** True als er iets gestaged staat (git diff --cached --quiet geeft dan exit 1). */
async function hasStagedChanges(cwd: string): Promise<boolean> {
  try {
    await runQuiet("git", ["diff", "--cached", "--quiet"], cwd);
    return false;
  } catch {
    return true;
  }
}

/** True als git een user.name én user.email geconfigureerd heeft. */
async function hasGitIdentity(cwd: string): Promise<boolean> {
  try {
    await runQuiet("git", ["config", "user.email"], cwd);
    await runQuiet("git", ["config", "user.name"], cwd);
    return true;
  } catch {
    return false;
  }
}

/** Verwijdert .git-mappen in directe submappen. */
function removeNestedGitDirs(projectDir: string): void {
  for (const entry of fs.readdirSync(projectDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === ".git") continue;
    const nested = path.join(projectDir, entry.name, ".git");
    if (fs.existsSync(nested)) {
      fs.rmSync(nested, { recursive: true, force: true });
    }
  }
}

/** Root-.gitignore en root-README met de projectnaam (submappen hebben hun eigen). */
function writeRootFiles(projectDir: string, projectName: string): void {
  const gitignore = path.join(projectDir, ".gitignore");
  if (!fs.existsSync(gitignore)) {
    fs.writeFileSync(
      gitignore,
      [
        "# OS / editor",
        ".DS_Store",
        "Thumbs.db",
        "",
        "# Env",
        ".env",
        ".env.local",
        "",
        "# Dependencies / build (submappen hebben ook een eigen .gitignore)",
        "node_modules/",
        "dist/",
        ".next/",
        "",
      ].join("\n"),
    );
  }

  const readme = path.join(projectDir, "README.md");
  if (!fs.existsSync(readme)) {
    const lines = [`# ${projectName}`, ""];
    if (fs.existsSync(path.join(projectDir, "frontend"))) {
      lines.push("## Frontend", "", "```bash", "cd frontend", "npm run dev", "```", "");
    }
    if (fs.existsSync(path.join(projectDir, "backend"))) {
      const isNest = fs.existsSync(path.join(projectDir, "backend", "nest-cli.json"));
      lines.push(
        "## Backend",
        "",
        "```bash",
        "cd backend",
        isNest ? "npm run start:dev" : "npm run dev",
        "```",
        "",
      );
    }
    fs.writeFileSync(readme, lines.join("\n"));
  }
}
