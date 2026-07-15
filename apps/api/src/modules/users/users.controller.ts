import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CreateUserInput, UpdateUserInput } from '@pandora/contracts';
import { Perm, SessionUser } from '../../common/auth.guard';
import { ZodPipe } from '../../common/zod.pipe';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Perm('settings', 'approve')
  async list() {
    return { data: await this.users.list() };
  }

  @Post()
  @Perm('settings', 'approve')
  async create(
    @Body(new ZodPipe(CreateUserInput)) body: CreateUserInput,
    @Req() req: Request & { user: SessionUser },
  ) {
    return { data: await this.users.create(body, req.user.id) };
  }

  @Patch(':id')
  @Perm('settings', 'approve')
  async update(
    @Param('id') id: string,
    @Body(new ZodPipe(UpdateUserInput)) body: UpdateUserInput,
    @Req() req: Request & { user: SessionUser },
  ) {
    return { data: await this.users.update(id, body, req.user.id) };
  }
}
