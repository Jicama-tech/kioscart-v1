import mongoose from "mongoose";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env") });

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to force-enable Razorpay in production. Use the UI toggle.");
  process.exit(1);
}

const TARGET_ID = "69046666c87f1a2cf5493cc1"; // Shree Sai Selection

await mongoose.connect(process.env.MONGO_URI);
const Shopkeeper = mongoose.connection.collection("shopkeepers");

const r = await Shopkeeper.updateOne(
  { _id: new mongoose.Types.ObjectId(TARGET_ID) },
  { $set: { "razorpay.directEnabled": true } },
);

console.log(`matched=${r.matchedCount} modified=${r.modifiedCount}`);
const after = await Shopkeeper.findOne({ _id: new mongoose.Types.ObjectId(TARGET_ID) });
console.log(`razorpay.directEnabled is now: ${after.razorpay?.directEnabled}`);

await mongoose.disconnect();
