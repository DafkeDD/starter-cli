import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import { copyTemplate } from "../utils/template.js";
import { withProgress } from "../utils/progress.js";
import type { Frontend } from "./frontend.js";

/**
 * De basis-layout uit het design: sidebar, topbar met avatar, contentgebied.
 *
 * Los te kiezen van de OIDC-schermen. Wie alleen een hub bouwt heeft geen schil
 * nodig; wie een app bouwt wil hem meestal wel, ook zonder login.
 */
export async function askAppShell(frontend: Frontend): Promise<boolean> {
  if (frontend !== "nextjs") return false;

  const answer = await p.confirm({
    message: "Basis-layout van het design installeren? (sidebar + topbar met avatar)",
    initialValue: true,
  });

  if (p.isCancel(answer)) {
    p.cancel("Geannuleerd.");
    process.exit(0);
  }

  return answer === true;
}

/**
 * Het designsysteem: tokens, componentklassen, iconen en primitieven.
 *
 * Wordt door twee dingen gebruikt - de schermen van de hub en deze schil - dus
 * installeren we het één keer op een gedeelde plek. Twee keer aanroepen is geen
 * probleem: het zet gewoon dezelfde bestanden opnieuw neer.
 */
export function installDesign(target: string): void {
  copyTemplate("design", target, {});
}

/**
 * Zet de schil om je pagina's heen.
 *
 * De schil komt in de [locale]-layout te staan en niet in de root-layout: zo
 * blijven de schermen van de hub op /oidc erbuiten. Die horen geen sidebar te
 * hebben - je bent daar nog niet ingelogd.
 */
export async function scaffoldAppShell(
  wanted: boolean,
  projectDir: string,
  dir: string,
  brand: string,
  /** Heeft dit project login? Dan haalt de schil de gebruiker op. */
  withAuth: boolean,
): Promise<void> {
  if (!wanted) return;

  const target = path.join(projectDir, dir);
  p.log.step(`Basis-layout opzetten in ./${dir} ...`);

  await withProgress(
    "Layout installeren",
    async () => {
      installDesign(target);

      copyTemplate("app-shell", target, {
        BRAND_NAME: brand,
        BRAND_SUB: "Portaal",
        USER_IMPORT: withAuth
          ? "import { getUser, loginUrl, logoutUrl } from '@/lib/auth'"
          : "",
        USER_LOOKUP: withAuth
          ? [
              "    const me = await getUser()",
              "    const user = me ? (me.name ?? me.email ?? 'Ingelogd') : null",
              "    const userSub = me?.email ?? ''",
              "    const loginUrl_ = loginUrl('/')",
              "    const logoutUrl_ = logoutUrl()",
              "",
            ].join("\n")
          : [
              "    // Dit project heeft geen login; de schil toont dus geen gebruiker.",
              "    const user = null",
              "    const userSub = ''",
              "    const loginUrl_ = null",
              "    const logoutUrl_ = null",
              "",
            ].join("\n"),
      });

      patchLocaleLayout(target);
      importShellCss(target);
    },
    12000,
  );

  p.log.success(`Basis-layout toegevoegd aan ./${dir}.`);
}

/**
 * Hangt de schil om de pagina's binnen [locale].
 *
 * Bewust hier en niet in de root-layout: alles buiten [locale] - de schermen
 * van de hub - blijft zo zonder sidebar.
 */
function patchLocaleLayout(target: string): void {
  const file = path.join(target, "src", "app", "[locale]", "layout.tsx");
  if (!fs.existsSync(file)) return;

  let src = fs.readFileSync(file, "utf8");
  if (src.includes("AppShell")) return;

  src = src.replace(
    "import { routing } from '@/i18n/routing'",
    "import { routing } from '@/i18n/routing'\nimport AppShell from '@/components/shell/AppShell'",
  );

  src = src.replace(
    "return <NextIntlClientProvider>{children}</NextIntlClientProvider>",
    [
      "return (",
      "        <NextIntlClientProvider>",
      "            <AppShell>{children}</AppShell>",
      "        </NextIntlClientProvider>",
      "    )",
    ].join("\n    "),
  );

  fs.writeFileSync(file, src, "utf8");
}

/** Laadt design.css en shell.css app-breed, vanuit de root-layout. */
function importShellCss(target: string): void {
  const file = path.join(target, "src", "app", "layout.tsx");
  if (!fs.existsSync(file)) return;

  let src = fs.readFileSync(file, "utf8");
  if (src.includes("./shell.css")) return;

  src = src.replace(
    "import './globals.css'",
    [
      "import './globals.css'",
      "// Het designsysteem en de schil. Na globals.css, zodat de tokens van het",
      "// design winnen waar ze elkaar overlappen.",
      "import './design.css'",
      "import './shell.css'",
    ].join("\n"),
  );

  fs.writeFileSync(file, src, "utf8");
}
