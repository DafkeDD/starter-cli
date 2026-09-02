import type { NextConfig } from 'next'

/**
 * Next draait hier achter je eigen server (zie src/index.ts of src/main.ts).
 *
 * Dat betekent één proces, één poort en één origin: de OIDC-endpoints, de
 * inlogschermen en je eigen app delen dezelfde server. Daardoor is er geen
 * proxy nodig en klopt de interaction-cookie van oidc-provider altijd.
 *
 * De prijs staat in de Next-documentatie: met een eigen server vervalt de
 * automatische statische optimalisatie. Voor een portaal achter een login
 * maakt dat niets uit - daar valt toch niets vooraf te renderen.
 */
const nextConfig: NextConfig = {
    poweredByHeader: false
}

export default nextConfig
