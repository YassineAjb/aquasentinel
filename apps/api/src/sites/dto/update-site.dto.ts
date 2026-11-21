import { IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateSiteDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsObject()
  boundary?: {
    type: 'Polygon';
    coordinates: number[][][];
  };

  @IsOptional()
  areaM2?: number;

  @IsOptional()
  @IsString()
  plantType?: string;

  @IsOptional()
  @IsString()
  plantAge?: string;

  @IsOptional()
  @IsString()
  soilType?: string;
}
