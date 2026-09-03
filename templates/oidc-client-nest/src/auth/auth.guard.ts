import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import type { SessionRequest, SessionUser } from './oidc.js'

/**
 * Laat alleen ingelogde bezoekers door.
 *
 *     @UseGuards(AuthGuard)
 *     @Get('profiel')
 *     profiel(@Req() req: SessionRequest) { ... }
 *
 * Gooit een echte Nest-exception, zodat je exception filters en je logging het
 * zien - anders dan een handmatige res.status(401) in je controller, die langs
 * die hele laag heen gaat.
 */
@Injectable()
export class AuthGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest<SessionRequest>()
        const user = req.session?.user as SessionUser | undefined
        if (!user) throw new UnauthorizedException('Niet ingelogd.')
        return true
    }
}

/**
 * Laat alleen beheerders door.
 *
 * De rol komt uit het id_token van de hub, dus die kan de bezoeker niet zelf
 * zetten. De hub controleert hem daarna nog eens op zijn eigen admin-API: de
 * autorisatie hangt niet aan deze ene regel.
 */
@Injectable()
export class AdminGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest<SessionRequest>()
        const user = req.session?.user as SessionUser | undefined
        if (!user) throw new UnauthorizedException('Niet ingelogd.')
        if (user.role !== 'admin') throw new ForbiddenException('Alleen voor beheerders.')
        return true
    }
}

/** De ingelogde gebruiker uit het request halen, zonder overal te casten. */
export function currentUser(req: SessionRequest): SessionUser | undefined {
    return req.session?.user as SessionUser | undefined
}
