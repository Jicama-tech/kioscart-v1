import {
  Injectable,
  NotImplementedException,
  Logger,
} from "@nestjs/common";
import { PaymentGateway, SupportedCountry } from "./payment-gateway.interface";
import { RazorpayGateway } from "./razorpay.gateway";

/**
 * Routes to the correct payment gateway adapter for a given country.
 * Today only India (Razorpay Route) is supported. SG and other countries
 * fall back to manual settlement until their adapters land.
 */
@Injectable()
export class PaymentGatewayFactory {
  private readonly logger = new Logger(PaymentGatewayFactory.name);

  constructor(private readonly razorpay: RazorpayGateway) {}

  forCountry(country: string): PaymentGateway {
    const normalized = (country || "").toUpperCase() as SupportedCountry;
    switch (normalized) {
      case "IN":
        return this.razorpay;
      default:
        throw new NotImplementedException(
          `Auto-settlement is coming soon for ${country || "this country"}. ` +
            `Use the manual payment QR for now.`,
        );
    }
  }

  isCountrySupported(country: string): boolean {
    try {
      this.forCountry(country);
      return true;
    } catch {
      return false;
    }
  }

  /** Lookup by provider name — used by webhook router to pick verifier. */
  forProvider(provider: string): PaymentGateway {
    if (provider === "razorpay") return this.razorpay;
    throw new NotImplementedException(`Unknown gateway provider: ${provider}`);
  }
}
