import pc from "picocolors";

/** Functie om het label van een lopende progress-bar te wijzigen. */
export type UpdateLabel = (label: string) => void;

const BAR_WIDTH = 24;
/** Vaste tekens vóór het label: "  " + bar + " " + "100%" + "  " */
const PREFIX_WIDTH = 2 + BAR_WIDTH + 1 + 4 + 2;

/**
 * Toont één geanimeerde progress-bar terwijl `task` loopt.
 *
 * De taak krijgt een `update()` mee om het label te wijzigen zonder een nieuwe
 * bar te starten — zo blijft het bij één bar per onderdeel (frontend, backend).
 *
 * npm/create-next-app rapporteren geen betrouwbaar percentage, dus de bar loopt
 * asymptotisch naar ~95% op basis van verstreken tijd en springt pas naar 100%
 * wanneer de taak echt klaar is. Op een niet-TTY (bv. gepipete output) draait de
 * taak zonder animatie.
 */
export async function withProgress<T>(
  label: string,
  task: (update: UpdateLabel) => Promise<T>,
  estMs = 25000,
): Promise<T> {
  const out = process.stdout;

  if (!out.isTTY) {
    return task(() => {});
  }

  const start = Date.now();
  let current = label;
  let finished = false;

  const draw = (ratio: number): void => {
    const r = Math.max(0, Math.min(1, ratio));
    const filled = Math.round(r * BAR_WIDTH);
    const bar = "█".repeat(filled) + "░".repeat(BAR_WIDTH - filled);
    const pct = String(Math.round(r * 100)).padStart(3, " ");

    // Label afkappen zodat de regel nooit wrapt — anders maakt elke redraw
    // een nieuwe lijn in plaats van dezelfde te overschrijven.
    const room = Math.max(0, (out.columns || 80) - PREFIX_WIDTH - 1);
    const text = current.length > room ? current.slice(0, Math.max(0, room - 1)) + "…" : current;

    out.cursorTo(0);
    out.clearLine(0);
    out.write(`  ${pc.cyan(bar)} ${pct}%  ${pc.dim(text)}`);
  };

  const update: UpdateLabel = (next) => {
    current = next;
  };

  draw(0);
  const timer = setInterval(() => {
    if (finished) return;
    const elapsed = Date.now() - start;
    draw(Math.min(0.95, 1 - Math.exp(-elapsed / estMs)));
  }, 120);

  const stop = (): void => {
    finished = true;
    clearInterval(timer);
  };

  try {
    const result = await task(update);
    stop();
    draw(1);
    out.write("\n");
    return result;
  } catch (err) {
    stop();
    out.write("\n");
    throw err;
  }
}
