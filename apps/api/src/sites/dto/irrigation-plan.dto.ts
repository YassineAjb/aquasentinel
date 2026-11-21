import { IsOptional, IsString } from 'class-validator';

export class IrrigationPlanDto {
  @IsOptional()
  @IsString()
  observationId?: string;
}
