import mongoose from "mongoose";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env") });

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to run dev script in production. Set NODE_ENV to anything else first.");
  process.exit(1);
}

const uri = process.env.MONGO_URI;
if (!uri) { console.error("MONGO_URI missing"); process.exit(1); }

await mongoose.connect(uri);
const Shopkeeper = mongoose.connection.collection("shopkeepers");
const docs = await Shopkeeper.find({}, { projection: { shopName: 1, whatsappNumber: 1, country: 1, razorpay: 1 } }).limit(50).toArray();

console.log(`Found ${docs.length} shopkeeper(s):\n`);
for (const d of docs) {
  console.log(`  _id:      ${d._id}`);
  console.log(`  shopName: ${d.shopName || "(unset)"}`);
  console.log(`  whatsapp: ${d.whatsappNumber || "(unset)"}`);
  console.log(`  country:  ${d.country || "(unset)"}`);
  console.log(`  razorpay:`);
  const r = d.razorpay || {};
  console.log(`    mode:                  ${r.mode ?? "(unset)"}`);
  console.log(`    accountId:             ${r.accountId ?? "(unset)"}`);
  console.log(`    status:                ${r.status ?? "(unset)"}`);
  console.log(`    directKeyId:           ${r.directKeyId ?? "(unset)"}`);
  console.log(`    directKeySecret:       ${r.directKeySecretEncrypted ? "(encrypted, present)" : "(unset)"}`);
  console.log(`    directKeyVerifiedAt:   ${r.directKeyVerifiedAt ?? "(unset)"}`);
  console.log(`    directEnabled:         ${r.directEnabled === undefined ? "(unset)" : r.directEnabled}`);
  console.log("  ---");
}
await mongoose.disconnect();
