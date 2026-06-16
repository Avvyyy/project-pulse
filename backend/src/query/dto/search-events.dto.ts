import {
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export type SortField  = 'timestamp' | 'severity_score' | 'received_at';
export type SortOrder  = 'asc' | 'desc';

/**
 * SearchEventsDto
 *
 * Supports two complementary query modes that are merged when both are present:
 *
 *   1. FREE-TEXT  — q="database timeout"
 *      Full-text search across the message field.
 *
 *   2. STRUCTURED — service=payments level=error
 *      Exact-match keyword filters on indexed fields.
 *
 *   3. QUERY LANGUAGE (q with colon syntax) — q="service:payments level:error timeout"
 *      Tokens with a "field:value" shape are parsed into structured filters;
 *      remaining tokens become the free-text query.
 *      Examples:
 *        "service:auth level:error"      → filter + no text query
 *        "service:payments timeout"      → filter + text="timeout"
 *        "level:error 500"               → filter + text="500"
 */
export class SearchEventsDto {
  // ── Query language / free text ───────────────────────────────────────────
  @IsOptional()
  @IsString()
  @MaxLength(500)
  q?: string;

  // ── Structured filters ────────────────────────────────────────────────────
  @IsOptional()
  @IsString()
  @MaxLength(100)
  service?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  environment?: string;

  @IsOptional()
  @IsIn(['error', 'warn', 'info', 'debug', 'trace'])
  level?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  errorType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  httpStatusCode?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  fingerprint?: string;

  // ── Tag filter: tags[]=database&tags[]=auth ───────────────────────────────
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  tags?: string[];

  // ── Date range ────────────────────────────────────────────────────────────
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  // ── Sorting ───────────────────────────────────────────────────────────────
  @IsOptional()
  @IsIn(['timestamp', 'severity_score', 'received_at'])
  sortBy?: SortField = 'timestamp';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: SortOrder = 'desc';

  // ── Pagination ────────────────────────────────────────────────────────────
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  page?: number = 0;
}

export class SearchErrorGroupsDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  service?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  environment?: string;

  @IsOptional()
  @IsIn(['error', 'warn', 'info', 'debug', 'trace'])
  level?: string;

  @IsOptional()
  @IsIn(['open', 'resolved', 'ignored'])
  status?: string;

  @IsOptional()
  @IsIn(['lastSeenAt', 'firstSeenAt', 'occurrenceCount'])
  sortBy?: string = 'lastSeenAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: SortOrder = 'desc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  page?: number = 0;
}
