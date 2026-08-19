import type { Router } from 'express'

/**
 * Dit project is GEEN beheerpaneel, dus hier worden geen admin-routes gezet.
 *
 * Wil je dat later wel, dan draai je `starter-cli` opnieuw in een nieuwe map en
 * antwoord je "ja" op de vraag of het project het beheerpaneel is — of je
 * schrijft hier zelf routes die de admin-API van de hub aanspreken.
 */
export function registerAdminRoutes(_router: Router): void {
    // bewust leeg
}
