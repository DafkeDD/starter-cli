import { Module } from '@nestjs/common'
import { AuthController } from './auth.controller.js'
import { AuthService } from './auth.service.js'
import { AdminController } from './admin.controller.js'
import { AdminGuard, AuthGuard } from './auth.guard.js'

@Module({
    controllers: [AuthController, AdminController],
    providers: [AuthService, AuthGuard, AdminGuard],
    // Exporteren, anders krijgt je eigen module "Nest can't resolve
    // dependencies" zodra je AuthService of een van de guards injecteert.
    exports: [AuthService, AuthGuard, AdminGuard]
})
export class AuthModule {}
