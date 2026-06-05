import {
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export enum EventLevel {
  ERROR = 'error',
  WARN  = 'warn',
  INFO  = 'info',
  DEBUG = 'debug',
  TRACE = 'trace',
}

export enum EventEnvironment {
  PRODUCTION  = 'production',
  STAGING     = 'staging',
  DEVELOPMENT = 'development',
  TEST        = 'test',
}

export class IngestEventDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  service: string;

  @IsEnum(EventEnvironment)
  environment: EventEnvironment;

  @IsEnum(EventLevel)
  level: EventLevel;

  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  message: string;

  @IsDateString()
  timestamp: string;

  @IsOptional()
  @IsString()
  @MaxLength(50000)
  stackTrace?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
