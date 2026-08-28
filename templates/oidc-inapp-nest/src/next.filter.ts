import { Catch, NotFoundException } from '@nestjs/common'
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common'
import type { Request, Response } from 'express'
import { handleRequest } from './screens.js'

/**
 * Alles waar Nest geen route voor heeft, is een pagina van Next.
 *
 * Waarom een filter en niet gewoon middleware achteraan: Nest hangt tijdens
 * app.init() zijn eigen 404 achter je controllers. Middleware die je daarna
 * toevoegt komt daar nog achter en wordt nooit bereikt - dan krijg je
 * {"message":"Cannot GET /_next/static/...","statusCode":404} en staat je
 * scherm zonder enige opmaak.
 *
 * Die 404 is een NotFoundException, en die kunnen we hier onderscheppen.
 */
@Catch(NotFoundException)
export class NextFilter implements ExceptionFilter {
    catch(_exception: NotFoundException, host: ArgumentsHost): void {
        const ctx = host.switchToHttp()
        handleRequest(ctx.getRequest<Request>(), ctx.getResponse<Response>())
    }
}
