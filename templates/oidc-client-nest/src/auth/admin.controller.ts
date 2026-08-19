import { Controller } from '@nestjs/common'

/**
 * Dit project is GEEN beheerpaneel, dus deze controller heeft geen routes.
 *
 * Wil je dat later wel, dan draai je `starter-cli` opnieuw in een nieuwe map en
 * antwoord je "ja" op de vraag of het project het beheerpaneel is — of je
 * schrijft hier zelf endpoints die de admin-API van de hub aanspreken.
 */
@Controller()
export class AdminController {}
