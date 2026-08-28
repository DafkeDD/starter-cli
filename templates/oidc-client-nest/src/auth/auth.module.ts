import { Module } from '@nestjs/common'
import { AuthController } from './auth.controller.js'
import { AuthService } from './auth.service.js'
import { AdminController } from './admin.controller.js'

@Module({
    controllers: [AuthController, AdminController],
    providers: [AuthService]
})
export class AuthModule {}
