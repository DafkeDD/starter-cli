import type { NextConfig } from 'next'

/**
 * Deze app wordt nooit rechtstreeks bezocht.
 *
 * De hub op poort {{OIDC_PORT}} proxyt /interaction/* en /_next/* hiernaartoe.
 * Zo staat alles op één origin en klopt de _interaction-cookie van
 * oidc-provider altijd — ook in Docker, waar de hub oidc.localhost heet.
 *
 * Daarom staat hier bewust geen basePath: de paden die de hub doorstuurt zijn
 * precies de paden die deze app zelf ook gebruikt.
 */
const nextConfig: NextConfig = {
    // De hub zit ervoor; deze app hoeft zijn eigen hostnaam niet te kennen.
    poweredByHeader: false
}

export default nextConfig
