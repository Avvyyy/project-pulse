import { Controller, Get, Query } from '@nestjs/common';
import { QueryService } from './query.service';
import { SearchErrorGroupsDto, SearchEventsDto } from './dto/search-events.dto';

/**
 * QueryController — read-only search & browse endpoints.
 *
 * All routes are unauthenticated in this implementation; add a guard
 * (e.g. ApiKeyGuard or a session guard) when you add user accounts.
 *
 * Examples:
 *   GET /api/v1/search/events?q=timeout
 *   GET /api/v1/search/events?service=payments&level=error
 *   GET /api/v1/search/events?q=service:auth+level:error+JWT
 *   GET /api/v1/search/events?tags[]=database&tags[]=timeout&from=2026-06-01T00:00:00Z
 *   GET /api/v1/search/groups?q=timeout&status=open&sortBy=occurrenceCount
 */
@Controller('search')
export class QueryController {
  constructor(private readonly query: QueryService) {}

  @Get('events')
  searchEvents(@Query() dto: SearchEventsDto) {
    return this.query.searchEvents(dto);
  }

  @Get('groups')
  searchGroups(@Query() dto: SearchErrorGroupsDto) {
    return this.query.searchErrorGroups(dto);
  }
}
