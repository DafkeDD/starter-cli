import fs from "node:fs";

/**
 * Voegt een blok toe aan een .env-bestand zonder te overschrijven.
 *
 * Meerdere stappen schrijven in hetzelfde bestand: de databasestap zet de
 * DB_-sleutels, de OIDC-client daarna de OIDC_-sleutels. Wie gewoon
 * writeFileSync gebruikt, gooit het werk van de vorige stap weg.
 *
 * Sleutels die er al staan worden niet nog eens toegevoegd - zo blijft het
 * bestand ook bij een tweede run leesbaar.
 */
export function mergeEnv(file: string, block: string): void {
  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const present = new Set(keysIn(existing));
  const wanted = keysIn(block);

  // Staan alle sleutels er al? Dan niets doen.
  if (wanted.length > 0 && wanted.every((key) => present.has(key))) return;

  const separator = existing.trim() === "" ? "" : "\n";
  fs.writeFileSync(file, existing.trimEnd() + separator + "\n" + block.trimStart(), "utf8");
}

/** De namen van de variabelen in een stuk .env-tekst. */
function keysIn(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => /^([A-Z0-9_]+)=/.exec(line.trim())?.[1])
    .filter((key): key is string => Boolean(key));
}
