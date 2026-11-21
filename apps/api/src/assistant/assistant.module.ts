import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { OllamaService } from './ollama.service';
import { RagService } from './rag.service';
import { ReportService } from './report.service';

@Module({
  imports: [ConfigModule],
  controllers: [AssistantController],
  providers: [OllamaService, RagService, ReportService, AssistantService],
})
export class AssistantModule {}
