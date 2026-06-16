import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AddTimelineEntryDto {
  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  actor?: string;
}
