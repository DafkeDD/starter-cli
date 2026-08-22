/**
 * Leest .env in.
 *
 * Dit moet de ALLEREERSTE import van je startbestand blijven. ES-modules
 * evalueren namelijk eerst alle imports en pas daarna de code eronder: zet je
 * process.loadEnvFile() gewoon bovenaan index.ts, dan is de database al
 * geconfigureerd met de verkeerde waarden voor die regel draait.
 *
 * process.loadEnvFile bestaat sinds Node 20.12. Geen dotenv nodig, en ook geen
 * --env-file in het startcommando: die vlag werkt niet in cmd.exe op Windows.
 */
try {
    process.loadEnvFile()
} catch {
    // Geen .env aanwezig - dan gelden de standaardwaarden in de code.
}

// Maakt van dit bestand een module in plaats van een globaal script.
export {}
