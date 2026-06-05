import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateIncidentDto {
  @IsOptional()
  @IsIn(['open', 'investigating', 'resolved'])
  status?: string;

  @IsOptional()
  @IsIn(['critical', 'high', 'medium', 'low'])
  severity?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  actor?: string;
}
