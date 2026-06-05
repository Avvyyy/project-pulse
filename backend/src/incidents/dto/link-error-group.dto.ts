import { IsUUID } from 'class-validator';

export class LinkErrorGroupDto {
  @IsUUID()
  errorGroupId: string;
}
