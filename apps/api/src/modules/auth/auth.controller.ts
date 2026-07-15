import { Body, Controller, Get, HttpCode, Patch, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { LoginInput, UpdateMeInput } from '@pandora/contracts';
import { Public, SessionUser } from '../../common/auth.guard';
import { ZodPipe } from '../../common/zod.pipe';
import { AuthService } from './auth.service';

const COOKIE = 'pandora_sid';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(LoginInput)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { cookie, expiresAt, user } = await this.auth.login(
      body,
      req.ip,
      req.header('user-agent'),
    );
    res.cookie(COOKIE, cookie, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      expires: expiresAt,
      path: '/',
    });
    return { data: user };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request & { user: SessionUser }, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.user);
    res.clearCookie(COOKIE, { path: '/' });
    return { data: { ok: true } };
  }

  @Get('me')
  async me(@Req() req: Request & { user: SessionUser }) {
    return { data: await this.auth.me(req.user) };
  }

  @Patch('me')
  async updateMe(
    @Req() req: Request & { user: SessionUser },
    @Body(new ZodPipe(UpdateMeInput)) body: UpdateMeInput,
  ) {
    return { data: await this.auth.updateMe(req.user, body) };
  }
}
