import { IsMongoId } from 'class-validator';

export class CompareDto {
  @IsMongoId()
  aId!: string;

  @IsMongoId()
  bId!: string;
}
