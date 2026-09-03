import type { Branding } from './clients.js'

const FALLBACK: Branding = { name: 'Identity', accent: '#333333', tagline: 'Centrale login' }

function layout(brand: Branding, title: string, body: string): string {
    return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title)} — ${e(brand.name)}</title>
<style>
  :root { --accent: ${kleur(brand.accent)}; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:grid; place-items:center;
         font-family: system-ui, sans-serif; background:#f5f6f8; color:#111; }
  .card { width:100%; max-width:380px; background:#fff; border:1px solid #e3e5e8;
          border-radius:12px; padding:32px; }
  .brand { display:flex; align-items:center; gap:10px; margin-bottom:4px; }
  .dot { width:12px; height:12px; border-radius:50%; background:var(--accent); }
  h1 { font-size:20px; margin:0; }
  .tagline { color:#666; font-size:13px; margin:0 0 24px; }
  label { display:block; font-size:13px; margin:14px 0 4px; }
  input { width:100%; padding:9px 11px; border:1px solid #d0d3d8; border-radius:7px; font-size:14px; }
  button { width:100%; margin-top:20px; padding:10px; border:0; border-radius:7px;
           background:var(--accent); color:#fff; font-size:14px; font-weight:600; cursor:pointer; }
  .alt { margin-top:16px; font-size:13px; text-align:center; }
  a { color:var(--accent); }
  .err { margin-top:14px; padding:9px 11px; border-radius:7px; background:#fdecea;
         color:#8a1c14; font-size:13px; }
  .muted { color:#666; font-size:12px; margin-top:18px; text-align:center; }
</style>
</head>
<body>
  <div class="card">
    <div class="brand"><span class="dot"></span><h1>${e(title)}</h1></div>
    <p class="tagline">${e(brand.name)} — ${e(brand.tagline)}</p>
    ${body}
    <p class="muted">Beveiligd door de centrale identity-hub</p>
  </div>
</body>
</html>`
}

/**
 * Maakt tekst veilig om in HTML te zetten.
 *
 * Nodig omdat deze schermen met sjabloonstrings gebouwd worden en niet met
 * React: alles wat je erin plakt is meteen markup. De naam en de tagline van een
 * client komen uit de clients-tabel, en dat is precies het veld dat het
 * aanmeld-endpoint schrijft. Een clientnaam met een script erin zou dus draaien
 * op de origin van de hub - waar de sessiecookies staan.
 */
/**
 * Een kleur die veilig in een style-blok mag.
 *
 * Escapen helpt hier niet: binnen <style> geldt HTML-escaping niet, dus een
 * accentkleur uit de database zou het stijlblok kunnen verlaten. Daarom geen
 * filter maar een vorm-controle - en anders de standaardkleur.
 */
function kleur(waarde: unknown): string {
    const v = String(waarde ?? '')
    return /^#[0-9a-f]{3,8}$/i.test(v) ? v : '#0f9d58'
}

function e(waarde: unknown): string {
    return String(waarde ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;')
}

export function loginPage(
    brand: Branding | undefined,
    uid: string,
    error?: string,
    mayRegister = false
): string {
    const b = brand ?? FALLBACK
    return layout(
        b,
        'Inloggen',
        `<form method="post" action="/interaction/${encodeURIComponent(uid)}/login">
      <label for="email">E-mailadres</label>
      <input id="email" name="email" type="email" autocomplete="username" required autofocus>
      <label for="password">Wachtwoord</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required>
      ${error ? `<div class="err">${e(error)}</div>` : ''}
      <button type="submit">Inloggen</button>
    </form>
    ${
        mayRegister
            ? `<p class="alt">Nog geen account? <a href="/interaction/${encodeURIComponent(uid)}/register">Registreren</a></p>`
            : ''
    }`
    )
}

export function registerPage(brand: Branding | undefined, uid: string, error?: string): string {
    const b = brand ?? FALLBACK
    return layout(
        b,
        'Registreren',
        `<form method="post" action="/interaction/${encodeURIComponent(uid)}/register">
      <label for="name">Naam</label>
      <input id="name" name="name" required autofocus>
      <label for="email">E-mailadres</label>
      <input id="email" name="email" type="email" autocomplete="username" required>
      <label for="password">Wachtwoord</label>
      <input id="password" name="password" type="password" autocomplete="new-password" minlength="8" required>
      ${error ? `<div class="err">${e(error)}</div>` : ''}
      <button type="submit">Account aanmaken</button>
    </form>
    <p class="alt">Al een account? <a href="/interaction/${encodeURIComponent(uid)}">Inloggen</a></p>`
    )
}
