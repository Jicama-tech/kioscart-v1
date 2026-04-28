import { Controller, Post, Body, UseGuards, Req, Get, Query } from "@nestjs/common";
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
    try {
      const reply = await this.chatbotService.processMessage(shopkeeperId, message, req.user.name);
      // Defensive: enforce non-empty text on every reply so the chat never
      // shows a blank bubble even if a future fast-path forgets to set it.
      if (!reply || !reply.text || !reply.text.trim()) {
        return {
          text: "I'm here. Could you rephrase that or pick one of the suggestions below?",
          quickActions: [
            { label: "Today's Revenue", action: "today's revenue" },
            { label: "Pending Orders", action: "show pending orders" },
            { label: "Show Products", action: "show all products" },
          ],
        };
      }
      return reply;
    } catch (err: any) {
      // Last-resort safety net — even if the service throws (e.g. Mongo
      // hiccup, provider outage with an unhandled error), the shopkeeper
      // gets a structured chat reply instead of a 500 / generic "Connection
      // error" that hides the real state.
      return {
        text: "I'm having trouble right now. Please try that again in a moment, or use one of the shortcuts below.",
        quickActions: [
          { label: "Today's Revenue", action: "today's revenue" },
          { label: "Pending Orders", action: "show pending orders" },
          { label: "Show Products", action: "show all products" },
        ],
      };
    }
  }


  // Used by the inline kiosk-order form to look up an existing customer by
  // name. Returns 0/1/many candidates with the contact details the form
  // pre-fills if found, so the shopkeeper doesn't have to retype phone/email
  // for repeat customers.
  @Get("customer-search")
  @UseGuards(AuthGuard("jwt"))
  async customerSearch(@Req() req: any, @Query("q") q: string) {
    const shopkeeperId = req.user.userId;
    return this.chatbotService.searchCustomersForOrderForm(shopkeeperId, q || "");
  }
}
