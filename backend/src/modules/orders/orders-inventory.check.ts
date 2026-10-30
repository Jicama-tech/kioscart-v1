/**
 * Checks that custom (one-off) order lines are skipped by the inventory functions. Run with:
 *   npx ts-node --transpile-only src/modules/orders/orders-inventory.check.ts
 */
import "reflect-metadata";
import * as assert from "node:assert/strict";
import { OrdersService } from "./orders.service";

let passed = 0;
const check = async (name: string, fn: () => Promise<void> | void) => {
  try {
    await fn();
    passed++;
  } catch (e: any) {
    console.error(`FAIL  ${name}\n      ${e.message}`);
    process.exitCode = 1;
  }
};

const P1 = "64b0000000000000000000a1";

function build() {
  const finds: any[] = [];
  const bulks: any[] = [];
  const product = { _id: P1, name: "Tee", trackQuantity: true, inventory: 5 };
  const productModel: any = {
    find: async (q: any) => {
      finds.push(q);
      return [product];
    },
    bulkWrite: async (ops: any[]) => {
      bulks.push(ops);
      return {};
    },
    updateOne: async () => ({}),
  };
  const svc: any = Object.create(OrdersService.prototype);
  svc.productModel = productModel;
  return { svc, finds, bulks };
}

const customLine = { productId: "custom", custom: true, productName: "Hamper", price: 450, quantity: 2, trackQuantity: false };

(async () => {
  for (const action of ["deduct", "restore"] as const) {
    await check(`${action}: a custom-only order touches no product and does not throw`, async () => {
      const { svc, finds, bulks } = build();
      await svc.updateProductInventory([customLine], action);
      assert.equal(finds.length, 0);
      assert.equal(bulks.length, 0);
    });

    await check(`${action}: custom lines are left out of the product lookup next to a real product`, async () => {
      const { svc, finds } = build();
      await svc.updateProductInventory(
        [customLine, { productId: P1, productName: "Tee", price: 500, quantity: 1, trackQuantity: true }],
        action,
      );
      assert.equal(finds.length, 1);
      assert.deepEqual(finds[0]._id.$in, [P1]);
    });

    await check(`${action}: an unknown real product still fails`, async () => {
      const { svc } = build();
      await assert.rejects(
        () => svc.updateProductInventory([{ productId: "64b0000000000000000000ff", quantity: 1, trackQuantity: true }], action),
        /not found/,
      );
    });
  }

  console.log(process.exitCode ? "Some checks failed." : `all ${passed} order inventory checks passed`);
})();
