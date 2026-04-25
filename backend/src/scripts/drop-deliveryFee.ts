/**
 * One-shot migration: physically remove the legacy `deliveryFee` field from
 * every Shopkeeper document. Safe to delete this file after running once.
 *
 *   cd backend
 *   npx ts-node src/scripts/drop-deliveryFee.ts
 *
 * The script bypasses Mongoose's schema filter via .collection.updateMany so
 * the $unset reaches Mongo even though the field is no longer declared on
 * the schema (Mongoose would otherwise strip the unknown operator path).
 */
import { NestFactory } from "@nestjs/core";
import { getModelToken } from "@nestjs/mongoose";
import { AppModule } from "../app.module";
import { Shopkeeper } from "../modules/shopkeepers/schemas/shopkeeper.schema";

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"],
  });
  try {
    const model = app.get<any>(getModelToken(Shopkeeper.name));
    const before = await model.collection.countDocuments({
      deliveryFee: { $exists: true },
    });
    console.log(`Documents with deliveryFee before: ${before}`);

    const res = await model.collection.updateMany(
      { deliveryFee: { $exists: true } },
      { $unset: { deliveryFee: "" } },
    );
    console.log(
      `matched=${res.matchedCount} modified=${res.modifiedCount}`,
    );

    const after = await model.collection.countDocuments({
      deliveryFee: { $exists: true },
    });
    console.log(`Documents with deliveryFee after: ${after}`);
  } finally {
    await app.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
