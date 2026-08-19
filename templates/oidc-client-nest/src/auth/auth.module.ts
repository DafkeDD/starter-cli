import { Module } from '@nestjs/common'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { AdminController } from './admin.controller'

@Module({
    controllers: [AuthController, AdminController],
    providers: [AuthService]
})
export class AuthModule {}
