import { IsBoolean, IsOptional } from 'class-validator';

export class ScanDto {
  /** Prefer an older clear scene (exclude scenes already stored for this site). */
  @IsOptional()
  @IsBoolean()
  older?: boolean;
}
