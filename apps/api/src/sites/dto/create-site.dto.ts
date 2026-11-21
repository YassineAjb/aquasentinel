import { IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateSiteDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsObject()
  boundary!: {
    type: 'Polygon';
    coordinates: number[][][];
  };

  @IsOptional()
  areaM2?: number;
}
