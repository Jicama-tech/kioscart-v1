import mongoose from "mongoose";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env") });

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed fake Razorpay data in production.");
  process.exit(1);
}

const TARGET_ID = "69046666c87f1a2cf5493cc1";

const uri = process.env.MONGO_URI;
if (!uri) { console.error("MONGO_URI missing"); process.exit(1); }

await mongoose.connect(uri);
const Shopkeeper = mongoose.connection.collection("shopkeepers");

const before = await Shopkeeper.findOne({ _id: new mongoose.Types.ObjectId(TARGET_ID) });
if (!before) { console.error(`Shopkeeper ${TARGET_ID} not found`); process.exit(1); }

console.log(`Target: ${before.shopName} (current razorpay.status: ${before.razorpay?.status || "none"})`);

const result = await Shopkeeper.updateOne(
  { _id: new mongoose.Types.ObjectId(TARGET_ID) },
  {
    $set: {
      country: "IN",
      "razorpay.accountId": "acc_test_fakeForLocalDev",
      "razorpay.status": "active",
      "razorpay.businessName": before.shopName || "Test Shop",
      "razorpay.country": "IN",
      "razorpay.kycStatus": "approved",
      commissionPercentage: 2,
    },
  },
);

console.log(`matched=${result.matchedCount} modified=${result.modifiedCount}`);

const after = await Shopkeeper.findOne({ _id: new mongoose.Types.ObjectId(TARGET_ID) });
console.log(`After: razorpay.accountId=${after.razorpay?.accountId} status=${after.razorpay?.status} commissionPct=${after.commissionPercentage}`);

await mongoose.disconnect();
