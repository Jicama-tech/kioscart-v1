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
    // Pass the JWT-resolved display name through so greetings can use it
    // without an extra DB hit. Falls back to DB lookup inside the service
    // when the token doesn't carry one.
    return this.chatbotService.processMessage(shopkeeperId, message, req.user.name);
  }
}
