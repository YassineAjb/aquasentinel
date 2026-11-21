import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Report, ReportSchema } from '../sites/schemas/report.schema';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { OllamaService } from './ollama.service';
import { RagService } from './rag.service';
import { ReportService } from './report.service';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([{ name: Report.name, schema: ReportSchema }]),
  ],
  controllers: [AssistantController],
  providers: [OllamaService, RagService, ReportService, AssistantService],
})
export class AssistantModule {}
