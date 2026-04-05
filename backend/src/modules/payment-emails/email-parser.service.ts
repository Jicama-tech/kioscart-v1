import { Injectable } from "@nestjs/common";

export interface ParsedPayment {
  amount: number | null;
  currency: string;
  senderName: string | null;
  referenceId: string | null;
  bankOrProvider: string | null;
}

@Injectable()
export class EmailParserService {
  private readonly amountPatterns = [
    // INR patterns
    /(?:Rs\.?|INR|₹)\s*([\d,]+\.?\d*)/i,
    /(?:amount|credited|received)\s*(?:of\s*)?(?:Rs\.?|INR|₹)\s*([\d,]+\.?\d*)/i,
    /([\d,]+\.?\d*)\s*(?:has been credited|credited to|received)/i,
    // SGD patterns
    /(?:SGD|S\$)\s*([\d,]+\.?\d*)/i,
    /(?:amount|credited|received)\s*(?:of\s*)?(?:SGD|S\$)\s*([\d,]+\.?\d*)/i,
    // USD patterns
    /(?:USD|\$)\s*([\d,]+\.?\d*)/i,
  ];

  private readonly currencyPatterns = [
    { pattern: /(?:Rs\.?|INR|₹)/i, currency: "INR" },
    { pattern: /(?:SGD|S\$)/i, currency: "SGD" },
    { pattern: /(?:USD|\$)/i, currency: "USD" },
  ];

  private readonly referencePatterns = [
    /(?:UTR|UPI Ref|Ref\.?\s*(?:No\.?)?|Reference|Transaction ID|Txn ID)\s*[:\s]?\s*([A-Za-z0-9]+)/i,
    /(?:UPI)\s*[:\s]?\s*([A-Za-z0-9]{12,})/i,
  ];

  private readonly senderPatterns = [
    /(?:from|sender|paid by|payer)\s*[:\s]?\s*([A-Za-z\s]+?)(?:\s*(?:via|through|using|$))/i,
    /(?:VPA|UPI ID)\s*[:\s]?\s*([^\s@]+@[^\s]+)/i,
  ];

  private readonly providerPatterns = [
    { pattern: /google\s*pay|gpay/i, provider: "Google Pay" },
    { pattern: /phonepe/i, provider: "PhonePe" },
    { pattern: /paytm/i, provider: "Paytm" },
    { pattern: /paynow/i, provider: "PayNow" },
    { pattern: /neft/i, provider: "NEFT" },
    { pattern: /imps/i, provider: "IMPS" },
    { pattern: /rtgs/i, provider: "RTGS" },
    { pattern: /upi/i, provider: "UPI" },
    { pattern: /dbs/i, provider: "DBS" },
    { pattern: /ocbc/i, provider: "OCBC" },
    { pattern: /uob/i, provider: "UOB" },
    { pattern: /sbi|state bank/i, provider: "SBI" },
    { pattern: /hdfc/i, provider: "HDFC" },
    { pattern: /icici/i, provider: "ICICI" },
    { pattern: /axis/i, provider: "Axis Bank" },
    { pattern: /kotak/i, provider: "Kotak" },
  ];

  isPaymentEmail(subject: string, body: string): boolean {
    const text = `${subject} ${body}`.toLowerCase();
    const keywords = [
      "credited",
      "received",
      "payment",
      "transfer",
      "amount",
      "credit alert",
      "money received",
      "fund transfer",
      "paynow",
      "upi",
    ];
    return keywords.some((kw) => text.includes(kw));
  }

  parse(subject: string, body: string): ParsedPayment {
    const text = `${subject} ${body}`;

    return {
      amount: this.extractAmount(text),
      currency: this.extractCurrency(text),
      senderName: this.extractSender(text),
      referenceId: this.extractReference(text),
      bankOrProvider: this.extractProvider(text),
    };
  }

  private extractAmount(text: string): number | null {
    for (const pattern of this.amountPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const cleaned = match[1].replace(/,/g, "");
        const amount = parseFloat(cleaned);
        if (!isNaN(amount) && amount > 0) return amount;
      }
    }
    return null;
  }

  private extractCurrency(text: string): string {
    for (const { pattern, currency } of this.currencyPatterns) {
      if (pattern.test(text)) return currency;
    }
    return "INR";
  }

  private extractReference(text: string): string | null {
    for (const pattern of this.referencePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) return match[1].trim();
    }
    return null;
  }

  private extractSender(text: string): string | null {
    for (const pattern of this.senderPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) return match[1].trim();
    }
    return null;
  }

  private extractProvider(text: string): string | null {
    for (const { pattern, provider } of this.providerPatterns) {
      if (pattern.test(text)) return provider;
    }
    return null;
  }
}
