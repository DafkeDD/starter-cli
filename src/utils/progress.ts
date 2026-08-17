import pc from "picocolors";

/**
 * Toont een geanimeerde progress-bar terwijl `task` loopt.
 *
 * create-next-app/npm rapporteren geen betrouwbaar percentage, dus de bar loopt
 * asymptotisch naar ~95% op basis van verstreken tijd en springt pas naar 100%
 * wanneer de taak echt klaar is. Op een niet-TTY (bv. gepipete output) draait
 * de taak zonder animatie.
 */
export async function withProgress<T>(
  label: string,
  task: () => Promise<T>,
  estMs = 25000,
): Promise<T> {
  if (!process.stdout.isTTY) {
    return task();
  }

  const width = 24;
  const start = Date.now();
  let finished = false;

  const draw = (ratio: number): void => {
    const r = Math.max(0, Math.min(1, ratio));
    const filled = Math.round(r * width);
    const bar = "█".repeat(filled) + "░".repeat(width - filled);
    const pct = String(Math.round(r * 100)).padStart(3, " ");
    process.stdout.write(`\r  ${pc.cyan(bar)} ${pct}%  ${pc.dim(label)}   `);
  };

  draw(0);
  const timer = setInterval(() => {
    if (finished) return;
    const elapsed = Date.now() - start;
    const ratio = Math.min(0.95, 1 - Math.exp(-elapsed / estMs));
    draw(ratio);
  }, 120);

  try {
    const result = await task();
    finished = true;
    clearInterval(timer);
    draw(1);
    process.stdout.write("\n");
    return result;
  } catch (err) {
    finished = true;
    clearInterval(timer);
    process.stdout.write("\n");
    throw err;
  }
}
