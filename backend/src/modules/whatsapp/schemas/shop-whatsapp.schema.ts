import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type ShopWhatsappDocument = ShopWhatsapp & Document;

/**
 * A shop's WhatsApp switch and the number it is linked as — one row per shop.
 *
 * This holds NO credentials. The pairing itself (the linked-device keys) lives
 * on disk under WHATSAPP_SHOP_AUTH_DIR, one folder per shop, because that is
 * how Baileys persists it and because a database dump or an admin screen
 * should never be able to leak something that lets a reader send as the shop.
 * `number` and `linkedAt` are only here so the Settings panel can say "Linked
 * as +91…" without a live socket, e.g. right after a server restart.
 */
@Schema({ collection: "shop_whatsapp", timestamps: true })
export class ShopWhatsapp {
  // `unique` builds the index; the id is also the auth folder's name on disk.
  @Prop({ required: true, unique: true })
  shopkeeperId: string;

  /** The shopkeeper's on/off switch. Off keeps the pairing on disk. */
  @Prop({ default: false })
  enabled: boolean;

  /** Digits, as WhatsApp reports them — null when not linked. */
  @Prop({ type: String, default: null })
  number?: string | null;

  @Prop({ type: Date, default: null })
  linkedAt?: Date | null;
}

export const ShopWhatsappSchema = SchemaFactory.createForClass(ShopWhatsapp);
