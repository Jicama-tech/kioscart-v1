import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CartItem } from "@/hooks/cartContext";

import { t as i18nT } from "@/i18n/t";

const MAX_TEXT = 120;
const MAX_PRICE = 9999999;

interface KioskCustomItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddItem: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
}

/**
 * "Customize": a one-off line for something that is not in the product catalog, for this order only. Nothing is
 * created in the catalog; the line lives in the cart and is stored on the order (productId "custom", custom: true).
 */
export function KioskCustomItemDialog({ open, onOpenChange, onAddItem }: KioskCustomItemDialogProps) {
  const [name, setName] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [variant, setVariant] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [submitted, setSubmitted] = useState(false);

  const trimmedName = name.trim();
  const priceNumber = Number(price);
  const qtyNumber = Number(quantity);

  const errors = {
    name: !trimmedName ? i18nT("Enter a product name") : "",
    price:
      !price.trim() ||
      !Number.isFinite(priceNumber) ||
      priceNumber <= 0 ||
      priceNumber > MAX_PRICE ||
      Math.round(priceNumber * 100) / 100 !== priceNumber
        ? i18nT("Enter a price above 0 (up to 2 decimals)")
        : "",
    quantity:
      !quantity.trim() || !Number.isInteger(qtyNumber) || qtyNumber < 1 || qtyNumber > 999
        ? i18nT("Quantity must be a whole number from 1 to 999")
        : "",
  };
  const valid = !errors.name && !errors.price && !errors.quantity;

  function reset() {
    setName("");
    setSubcategory("");
    setVariant("");
    setPrice("");
    setQuantity("1");
    setSubmitted(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function handleAdd() {
    setSubmitted(true);
    if (!valid) return;
    onAddItem(
      {
        // unique per line, so two custom lines never merge in the cart
        productId: `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
        productName: trimmedName,
        price: Math.round(priceNumber * 100) / 100,
        inventory: 0,
        trackQuantity: false,
        subcategoryIndex: 0,
        variantIndex: 0,
        subcategoryName: subcategory.trim() || "Default",
        variantTitle: variant.trim() || "Default",
        custom: true,
      },
      qtyNumber,
    );
    handleOpenChange(false);
  }

  const err = (msg: string) =>
    submitted && msg ? <p className="text-xs text-red-500 mt-1">{msg}</p> : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{i18nT("Customize")}</DialogTitle>
          <DialogDescription>
            {i18nT("A one-off item for this order only. It is not added to your products.")}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            handleAdd();
          }}
        >
          <div>
            <Label htmlFor="custom-name">
              {i18nT("Product name")} <span className="text-red-500">*</span>
            </Label>
            <Input
              id="custom-name"
              value={name}
              maxLength={MAX_TEXT}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            {err(errors.name)}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="custom-subcategory">{i18nT("Subcategory")}</Label>
              <Input
                id="custom-subcategory"
                value={subcategory}
                maxLength={MAX_TEXT}
                onChange={(e) => setSubcategory(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="custom-variant">{i18nT("Variant")}</Label>
              <Input
                id="custom-variant"
                value={variant}
                maxLength={MAX_TEXT}
                onChange={(e) => setVariant(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="custom-price">
                {i18nT("Price")} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="custom-price"
                type="number"
                inputMode="decimal"
                min="0.01"
                max={MAX_PRICE}
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
              {err(errors.price)}
            </div>
            <div>
              <Label htmlFor="custom-quantity">
                {i18nT("Quantity")} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="custom-quantity"
                type="number"
                inputMode="numeric"
                min="1"
                max="999"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
              {err(errors.quantity)}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              {i18nT("Cancel")}
            </Button>
            <Button type="submit">{i18nT("Add to order")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
