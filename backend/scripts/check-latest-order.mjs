import mongoose from "mongoose";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env") });

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to run dev script in production.");
  process.exit(1);
}

await mongoose.connect(process.env.MONGO_URI);
const Orders = mongoose.connection.collection("orders");
const latest = await Orders.find({}).sort({ createdAt: -1 }).limit(3).toArray();

for (const o of latest) {
  console.log(`_id: ${o._id}`);
  console.log(`orderId: ${o.orderId}`);
  console.log(`customerName: ${JSON.stringify(o.customerName)}`);
  console.log(`fullName (dto): ${JSON.stringify(o.fullName)}`);
  console.log(`firstName: ${JSON.stringify(o.firstName)}`);
  console.log(`lastName: ${JSON.stringify(o.lastName)}`);
  console.log(`paymentStatus: ${o.paymentStatus}`);
  console.log(`paymentProvider: ${o.paymentProvider}`);
  console.log(`createdAt: ${o.createdAt}`);
  console.log("---");
}
await mongoose.disconnect();
