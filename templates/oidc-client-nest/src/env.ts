/**
 * Leest backend/.env in.
 *
 * Dit moet gebeuren vóórdat andere modules `process.env` uitlezen. In ESM
 * worden imports in volgorde geëvalueerd, dus dit bestand wordt als eerste
 * geïmporteerd in main.ts — daarom staat het apart en niet gewoon bovenaan
 * main.ts: daar zou het ná alle imports draaien en dus te laat zijn.
 *
 * `process.loadEnvFile()` zit in Node zelf (20.12+), dus geen dotenv nodig en
 * geen vlaggen in de npm-scripts die op Windows anders quoten dan op Linux.
 */
try {
    process.loadEnvFile()
} catch {
    // Geen .env aanwezig — dan gelden de standaardwaarden in de code.
}

// Maakt van dit bestand een module in plaats van een globaal script.
export {}
