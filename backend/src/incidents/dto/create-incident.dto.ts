import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateIncidentDto {
  @IsString()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(['critical', 'high', 'medium', 'low'])
  severity: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  service?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  environment?: string;
}
