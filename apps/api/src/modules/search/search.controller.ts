import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { SearchQuery } from '@pandora/contracts';
import { SessionUser } from '../../common/auth.guard';
import { ZodPipe } from '../../common/zod.pipe';
import { SearchService } from './search.service';

@Controller()
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get('search')
  async run(
    @Query(new ZodPipe(SearchQuery)) query: SearchQuery,
    @Req() req: Request & { user: SessionUser },
  ) {
    return { data: await this.search.search(query.q, req.user.perms) };
  }
}
