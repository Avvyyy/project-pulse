import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/**
 * condition JSON shapes:
 *   threshold    : { type, metric, threshold, windowSeconds }
 *   spike        : { type, multiplier, windowSeconds, baselineWindowSeconds }
 *   recurrence   : { type, minutes }
 *   new_error_group : { type }
 */
export class CreateAlertDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

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

  @IsObject()
  condition: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
