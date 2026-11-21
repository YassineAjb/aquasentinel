import { Body, Controller, Get, Post } from '@nestjs/common';
import { AssistantService, ChatMessage } from './assistant.service';

@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  // GET /assistant/health : Ollama est-il joignable ? combien de passages indexés ?
  @Get('health')
  health() {
    return this.assistant.health();
  }

  // GET /assistant/reports : derniers rapports (id, titre, dates) pour les choisir dans l'interface
  @Get('reports')
  reports() {
    return this.assistant.listReports();
  }

  // POST /assistant/ask : { reportId, question?, history?, lang? } -> { answer, sources }
  @Post('ask')
  ask(@Body() body: { reportId?: string; report?: unknown; question?: string; history?: ChatMessage[]; lang?: string }) {
    return this.assistant.ask(body);
  }
}
