import { Controller, Get } from '@nestjs/common'

@Controller('api')
export class AppController {
    /** Bewijst dat je Nest-routes vóór het Next-vangnet komen. */
    @Get('health')
    health(): { status: string } {
        return { status: 'ok' }
    }
}
