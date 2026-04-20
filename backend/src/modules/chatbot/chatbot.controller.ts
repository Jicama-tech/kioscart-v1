import { Controller, Post, Body, UseGuards, Req } from "@nestjs/common";
import { ChatbotService } from "./chatbot.service";
import { AuthGuard } from "@nestjs/passport";

@Controller("chatbot")
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  @Post("message")
  @UseGuards(AuthGuard("jwt"))
  async handleMessage(@Req() req: any, @Body("message") message: string) {
    const shopkeeperId = req.user.userId;
    return this.chatbotService.processMessage(shopkeeperId, message);
  }
}
