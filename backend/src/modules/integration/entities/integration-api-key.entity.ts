import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

/**
 * One server-to-server credential per shop. Only the SHA-256 of the key is
 * stored; the plaintext is shown to the shopkeeper once, when it is created.
 */
@Schema({ timestamps: true, collection: "integration_api_keys" })
export class IntegrationApiKey extends Document {
  @Prop({ type: Types.ObjectId, ref: "Shopkeeper", required: true, index: true })
  shopkeeperId: Types.ObjectId;

  @Prop({ required: true, unique: true })
  keyHash: string;

  // First characters of the key, so the dashboard can tell keys apart.
  @Prop({ required: true })
  prefix: string;

  @Prop({ type: Date, default: null })
  lastUsedAt: Date | null;

  @Prop({ type: Date, default: null })
  revokedAt: Date | null;
}

export const IntegrationApiKeySchema =
  SchemaFactory.createForClass(IntegrationApiKey);
