"use client";

import { useState, useRef, useEffect } from "react";
import { useItems } from "@/hooks/useItems";
import { useCustomers } from "@/hooks/useCustomers";
import { useUser } from "@/hooks/useUser";
import { formatCurrency } from "@/lib/utils/format";
import { isInventoryItemType, itemTypeLabel, normalizeItemType } from "@/lib/items/type";

interface CartItem {
  itemId: string;
  name: string;
  manufacturer: string;
  itemType: "INVENTORY" | "NON_INVENTORY" | "SERVICE";
  quantity: number;
  price: number;
  discountAmount: number;
  lineDiscountType: "amount" | "percent";
  maxStock: number;
  unitName?: string;
  piecesPerUnit?: number;
  cartonsInput?: number;
  piecesInput?: number;
  retailPrice?: number | null;
  wholesalePrice?: number | null;
  promoPrice?: number | null;
  priceTier?: "default" | "retail" | "wholesale" | "promo";
}

interface SaleFormData {
  customerId?: string;
  paidAmount?: number;
  paymentMethod?: "CASH" | "MOMO" | "BANK";
  items: { itemId: string; quantity: number; price: number; discountAmount: number }[];
}

interface SaleFormProps {
  onSubmit: (data: SaleFormData) => Promise<void>;
  onCancel?: () => void;
}

const UNLIMITED_SALE_QTY = 999999;

// Reusable stepper button group
function Stepper({
  value,
  onDecrement,
  onIncrement,
  onChange,
  min,
  max,
  step = 1,
  color = "gray",
}: {
  value: number;
  onDecrement: () => void;
  onIncrement: () => void;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  color?: "gray" | "amber" | "green";
}) {
  const borderCls =
    color === "amber"
      ? "border-amber-300"
      : color === "green"
        ? "border-green-300"
        : "border-gray-200";
  const hoverCls =
    color === "amber"
      ? "hover:bg-amber-50"
      : color === "green"
        ? "hover:bg-green-50"
        : "hover:bg-gray-100";
  return (
    <div
      className={`flex items-center border-2 ${borderCls} rounded-lg overflow-hidden bg-white shrink-0`}
    >
      <button
        type="button"
        onClick={onDecrement}
        disabled={min !== undefined && value <= min}
        className={`px-2 md:px-3 py-1.5 md:py-2 text-gray-600 ${hoverCls} font-bold text-sm disabled:opacity-30 transition-colors`}
      >
        −
      </button>
      <input
        type="number"
        value={value}
        onChange={(e) =>
          onChange(
            step < 1
              ? parseFloat(e.target.value) || 0
              : parseInt(e.target.value) || 0,
          )
        }
        min={min}
        max={max}
        step={step}
        className="flex-1 min-w-0 w-10 md:w-16 text-center text-sm font-bold text-gray-900 focus:outline-none py-1.5 md:py-2 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={onIncrement}
        disabled={max !== undefined && value >= max}
        className={`px-2 md:px-3 py-1.5 md:py-2 text-gray-600 ${hoverCls} font-bold text-sm disabled:opacity-30 transition-colors`}
      >
        +
      </button>
    </div>
  );
}

export function SaleForm({ onSubmit, onCancel }: SaleFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const { user } = useUser();
  const [useUnitSystem, setUseUnitSystem] = useState(false);
  const [enableRetailPrice, setEnableRetailPrice] = useState(false);
  const [enableWholesalePrice, setEnableWholesalePrice] = useState(false);
  const [enablePromoPrice, setEnablePromoPrice] = useState(false);
  const [enableDiscounts, setEnableDiscounts] = useState(false);
  const [enableCreditSales, setEnableCreditSales] = useState(false);
  const [allowSaleOnZeroStock, setAllowSaleOnZeroStock] = useState(false);
  useEffect(() => {
    if (!user?.tenantId) return;
    fetch(`/api/tenants/${user.tenantId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.useUnitSystem) setUseUnitSystem(true);
        if (data?.enableRetailPrice) setEnableRetailPrice(true);
        if (data?.enableWholesalePrice) setEnableWholesalePrice(true);
        if (data?.enablePromoPrice) setEnablePromoPrice(true);
        if (data?.enableDiscounts) setEnableDiscounts(true);
        if (data?.enableCreditSales) setEnableCreditSales(true);
        if (data?.allowSaleOnZeroStock) setAllowSaleOnZeroStock(true);
      })
      .catch(() => {});
  }, [user?.tenantId]);

  const [discountType, setDiscountType] = useState<"amount" | "percent">(
    "percent",
  );
  const [discountValue, setDiscountValue] = useState("");
  const [paymentType, setPaymentType] = useState<"CASH" | "CREDIT">("CASH");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "MOMO" | "BANK">("CASH");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [itemSearch, setItemSearch] = useState("");
  const [showItemDropdown, setShowItemDropdown] = useState(false);
  const itemSearchRef = useRef<HTMLDivElement>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<{
    id: string;
    name: string;
    balance: number;
  } | null>(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const customerSearchRef = useRef<HTMLDivElement>(null);
  const [amountPaid, setAmountPaid] = useState("");

  // ── Draft persistence ─────────────────────────────────────────────────────
  const draftKey = user?.tenantId ? `sale_draft_${user.tenantId}` : null;
  const [hasDraft, setHasDraft] = useState(false);

  // On mount: detect a saved draft and show restore banner
  useEffect(() => {
    if (!draftKey) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) setHasDraft(true);
    } catch {}
  }, [draftKey]);

  // Save draft whenever meaningful state changes
  useEffect(() => {
    if (!draftKey) return;
    if (cart.length === 0 && !selectedCustomer && !amountPaid) return; // nothing to save
    try {
      localStorage.setItem(draftKey, JSON.stringify({
        cart,
        selectedCustomer,
        paymentType,
        paymentMethod,
        discountType,
        discountValue,
        amountPaid,
      }));
    } catch {}
  }, [draftKey, cart, selectedCustomer, paymentType, paymentMethod, discountType, discountValue, amountPaid]);

  const restoreDraft = () => {
    if (!draftKey) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.cart) setCart(d.cart);
      if (d.selectedCustomer) setSelectedCustomer(d.selectedCustomer);
      if (d.paymentType) setPaymentType(d.paymentType);
      if (d.paymentMethod) setPaymentMethod(d.paymentMethod);
      if (d.discountType) setDiscountType(d.discountType);
      if (d.discountValue !== undefined) setDiscountValue(d.discountValue);
      if (d.amountPaid !== undefined) setAmountPaid(d.amountPaid);
    } catch {}
    setHasDraft(false);
  };

  const discardDraft = () => {
    if (!draftKey) return;
    try { localStorage.removeItem(draftKey); } catch {}
    setHasDraft(false);
  };

  const clearDraft = () => {
    if (!draftKey) return;
    try { localStorage.removeItem(draftKey); } catch {}
  };

  const { items } = useItems();
  const { customers } = useCustomers();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        itemSearchRef.current &&
        !itemSearchRef.current.contains(e.target as Node)
      )
        setShowItemDropdown(false);
      if (
        customerSearchRef.current &&
        !customerSearchRef.current.contains(e.target as Node)
      )
        setShowCustomerDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filteredItems = itemSearch.trim()
    ? items
        .filter(
          (i) =>
            i.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
            (i.manufacturer?.name || "")
              .toLowerCase()
              .includes(itemSearch.toLowerCase()),
        )
        .slice(0, 10)
    : items.slice(0, 10);

  const filteredCustomers = customerSearch.trim()
    ? customers
        .filter(
          (c) =>
            c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
            (c.phone || "").includes(customerSearch),
        )
        .slice(0, 8)
    : customers.slice(0, 8);

  const addToCart = (item: (typeof items)[0]) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.itemId === item.id);
      if (existing) {
        const maxQty = isInventoryItemType(existing.itemType)
          ? existing.maxStock
          : UNLIMITED_SALE_QTY;
        if (useUnitSystem && (item.piecesPerUnit ?? 1) > 1) {
          const newCartons = (existing.cartonsInput ?? 0) + 1;
          const ppu = item.piecesPerUnit ?? 1;
          const newQty = Math.min(
            newCartons + (existing.piecesInput ?? 0) / ppu,
            maxQty,
          );
          return prev.map((c) =>
            c.itemId === item.id
              ? { ...c, cartonsInput: newCartons, quantity: newQty }
              : c,
          );
        }
        return prev.map((c) =>
          c.itemId === item.id
            ? { ...c, quantity: Math.min(c.quantity + 1, maxQty) }
            : c,
        );
      }
      const stockTracked = isInventoryItemType(item.itemType);
      return [
        ...prev,
        {
          itemId: item.id,
          name: item.name,
          manufacturer: item.manufacturer?.name || "Unknown",
          itemType: normalizeItemType(item.itemType),
          quantity: 1,
          price: item.sellingPrice,
          discountAmount: 0,
          lineDiscountType: "percent" as const,
          maxStock: stockTracked
            ? (allowSaleOnZeroStock ? UNLIMITED_SALE_QTY : item.quantity)
            : UNLIMITED_SALE_QTY,
          unitName: item.unitName,
          piecesPerUnit: item.piecesPerUnit,
          cartonsInput: 1,
          piecesInput: 0,
          retailPrice: item.retailPrice ?? null,
          wholesalePrice: item.wholesalePrice ?? null,
          promoPrice: item.promoPrice ?? null,
          priceTier: "default" as const,
        },
      ];
    });
    setItemSearch("");
    setShowItemDropdown(false);
  };

  const updateQty = (itemId: string, qty: number) => {
    if (qty <= 0) {
      removeFromCart(itemId);
      return;
    }
    setCart((prev) =>
      prev.map((c) => {
        if (c.itemId !== itemId) return c;
        const maxQty = isInventoryItemType(c.itemType)
          ? c.maxStock
          : UNLIMITED_SALE_QTY;
        return { ...c, quantity: Math.min(qty, maxQty) };
      }),
    );
  };

  const updateCartons = (itemId: string, cartons: number) => {
    setCart((prev) =>
      prev.map((c) => {
        if (c.itemId !== itemId) return c;
        const ppu = c.piecesPerUnit ?? 1;
        const pieces = c.piecesInput ?? 0;
        const maxQty = isInventoryItemType(c.itemType)
          ? c.maxStock
          : UNLIMITED_SALE_QTY;
        const qty = Math.min(Math.max(0, cartons) + pieces / ppu, maxQty);
        return { ...c, cartonsInput: Math.max(0, cartons), quantity: qty };
      }),
    );
  };

  const updatePieces = (itemId: string, pieces: number) => {
    setCart((prev) =>
      prev.map((c) => {
        if (c.itemId !== itemId) return c;
        const ppu = c.piecesPerUnit ?? 1;
        const cartons = c.cartonsInput ?? 0;
        const clampedPieces = Math.min(Math.max(0, pieces), ppu - 1);
        const maxQty = isInventoryItemType(c.itemType)
          ? c.maxStock
          : UNLIMITED_SALE_QTY;
        const qty = Math.min(cartons + clampedPieces / ppu, maxQty);
        return { ...c, piecesInput: clampedPieces, quantity: qty };
      }),
    );
  };

  const updatePrice = (itemId: string, price: number) => {
    setCart((prev) =>
      prev.map((c) =>
        c.itemId === itemId ? { ...c, price: Math.max(0, price) } : c,
      ),
    );
  };

  const updateDiscount = (itemId: string, discount: number) => {
    setCart((prev) =>
      prev.map((c) => {
        if (c.itemId !== itemId) return c;
        const max = c.lineDiscountType === "percent" ? 100 : c.price * c.quantity;
        return { ...c, discountAmount: Math.max(0, Math.min(discount, max)) };
      }),
    );
  };

  const updateLineDiscountType = (itemId: string, type: "amount" | "percent") => {
    setCart((prev) =>
      prev.map((c) =>
        c.itemId === itemId ? { ...c, lineDiscountType: type, discountAmount: 0 } : c,
      ),
    );
  };

  const updatePriceTier = (
    itemId: string,
    tier: "default" | "retail" | "wholesale" | "promo",
  ) => {
    setCart((prev) =>
      prev.map((c) => {
        if (c.itemId !== itemId) return c;
        let newPrice = c.price;
        if (tier === "retail" && c.retailPrice != null)
          newPrice = c.retailPrice;
        else if (tier === "wholesale" && c.wholesalePrice != null)
          newPrice = c.wholesalePrice;
        else if (tier === "promo" && c.promoPrice != null)
          newPrice = c.promoPrice;
        return { ...c, priceTier: tier, price: newPrice };
      }),
    );
  };

  const removeFromCart = (itemId: string) => {
    setCart((prev) => prev.filter((c) => c.itemId !== itemId));
  };

  const hasPriceTiers =
    enableRetailPrice || enableWholesalePrice || enablePromoPrice;

  const resolveLineDiscount = (c: CartItem): number => {
    const gross = c.price * c.quantity;
    if (c.lineDiscountType === "percent") return Math.min(100, c.discountAmount || 0) / 100 * gross;
    return Math.min(c.discountAmount || 0, gross);
  };
  const subtotal = cart.reduce((sum, c) => sum + Math.max(0, c.price * c.quantity - resolveLineDiscount(c)), 0);
  const discountNum = parseFloat(discountValue) || 0;
  const discountAmount = enableDiscounts
    ? discountType === "percent"
      ? Math.min((subtotal * discountNum) / 100, subtotal)
      : Math.min(discountNum, subtotal)
    : 0;
  const totalAmount = Math.max(0, subtotal - discountAmount);
  const paidNum = parseFloat(amountPaid) || 0;
  const change = paidNum - totalAmount;
  const creditAmount = totalAmount - paidNum;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (cart.length === 0) {
      setFormError("Add at least one item to the cart");
      return;
    }
    if (paymentType === "CREDIT" && !selectedCustomer) {
      setFormError("Credit sales require a customer to be selected");
      return;
    }
    const data: SaleFormData = {
      customerId: selectedCustomer?.id,
      paymentMethod,
      items: cart.map((c) => ({
        itemId: c.itemId,
        quantity: c.quantity,
        price: c.price,
        discountAmount: resolveLineDiscount(c),
      })),
    };
    if (paymentType === "CASH") {
      data.paidAmount = totalAmount;
    } else {
      data.paidAmount = paidNum >= 0 && paidNum <= totalAmount ? paidNum : 0;
    }
    setIsSubmitting(true);
    try {
      await onSubmit(data);
      clearDraft();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to create sale",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* Draft restore banner */}
      {hasDraft && (
        <div className="flex items-center gap-3 bg-amber-50 border-2 border-amber-300 rounded-xl px-4 py-3">
          <span className="text-xl shrink-0">📋</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-900">You have an unsaved sale draft</p>
            <p className="text-xs text-amber-700">Continue where you left off?</p>
          </div>
          <button type="button" onClick={restoreDraft}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg shrink-0 transition-colors">
            Restore
          </button>
          <button type="button" onClick={discardDraft}
            className="px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 text-xs font-semibold rounded-lg shrink-0 transition-colors">
            Discard
          </button>
        </div>
      )}

      {/* Payment Type Toggle (CASH vs CREDIT) */}
      <div className={`grid gap-3 ${enableCreditSales ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {(["CASH", ...(enableCreditSales ? ["CREDIT"] : [])] as ("CASH" | "CREDIT")[]).map((type) => {
          const active = paymentType === type;
          const isCash = type === "CASH";
          return (
            <button
              key={type}
              type="button"
              onClick={() => setPaymentType(type)}
              className={`py-3.5 rounded-xl font-bold text-sm transition-all border-2 flex items-center justify-center gap-2.5 ${
                active
                  ? isCash
                    ? "bg-blue-600 text-white border-blue-600 shadow-md"
                    : "bg-orange-500 text-white border-orange-500 shadow-md"
                  : isCash
                    ? "bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:bg-blue-50"
                    : "bg-white text-gray-600 border-gray-200 hover:border-orange-300 hover:bg-orange-50"
              }`}
            >
              <span className="text-xl">{isCash ? "💵" : "📋"}</span>
              <div className="text-left">
                <p className="font-bold">
                  {isCash ? "Cash Sale" : "Credit Sale"}
                </p>
                <p
                  className={`text-xs font-normal ${active ? "opacity-80" : "text-gray-400"}`}
                >
                  {isCash ? "Pay in full now" : "Pay later / partial"}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Payment Method (how money is received) */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Payment Method</p>
        <div className="grid grid-cols-3 gap-2">
          {(["CASH", "MOMO", "BANK"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setPaymentMethod(m)}
              className={`py-2.5 rounded-xl font-bold text-sm transition-all border-2 flex items-center justify-center gap-1.5 ${
                paymentMethod === m
                  ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                  : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50"
              }`}
            >
              <span>{m === "CASH" ? "💵" : m === "MOMO" ? "📱" : "🏦"}</span>
              {m === "CASH" ? "Cash" : m === "MOMO" ? "MoMo" : "Bank"}
            </button>
          ))}
        </div>
      </div>

      {/* Customer Search */}
      <div ref={customerSearchRef} className="relative">
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
          Customer
          {paymentType === "CREDIT" ? (
            <span className="text-red-500 ml-0.5">*</span>
          ) : (
            <span className="text-gray-400 font-normal ml-1">(optional)</span>
          )}
        </label>
        {selectedCustomer ? (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-50 border-2 border-blue-200 rounded-xl">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold shrink-0 text-sm">
              {selectedCustomer.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-sm">
                {selectedCustomer.name}
              </p>
              {selectedCustomer.balance > 0 && (
                <p className="text-xs text-red-600">
                  Outstanding: {formatCurrency(selectedCustomer.balance)}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedCustomer(null);
                setCustomerSearch("");
              }}
              className="text-gray-400 hover:text-gray-700 text-xl leading-none shrink-0"
            >
              ×
            </button>
          </div>
        ) : (
          <>
            <input
              type="text"
              placeholder="Search by name or phone..."
              value={customerSearch}
              onChange={(e) => {
                setCustomerSearch(e.target.value);
                setShowCustomerDropdown(true);
              }}
              onFocus={() => setShowCustomerDropdown(true)}
              className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none text-sm"
            />
            {showCustomerDropdown && filteredCustomers.length > 0 && (
              <div className="absolute z-20 mt-1 w-full bg-white border-2 border-gray-200 rounded-xl shadow-xl overflow-hidden">
                {filteredCustomers.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelectedCustomer(c);
                      setCustomerSearch("");
                      setShowCustomerDropdown(false);
                    }}
                    className="w-full px-4 py-2.5 text-left hover:bg-blue-50 flex items-center gap-3 border-b border-gray-100 last:border-0"
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 ${c.balance > 0 ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}
                    >
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">
                        {c.name}
                      </p>
                      {c.balance > 0 && (
                        <p className="text-xs text-red-500">
                          Owes {formatCurrency(c.balance)}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {showCustomerDropdown &&
              customerSearch.trim() &&
              filteredCustomers.length === 0 && (
                <div className="absolute z-20 mt-1 w-full bg-white border-2 border-gray-200 rounded-xl shadow-xl p-4 text-center text-sm text-gray-500">
                  No customers found
                </div>
              )}
          </>
        )}
      </div>

      {/* Item Search */}
      <div ref={itemSearchRef} className="relative">
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
          Add Items <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search items by name or manufacturer..."
            value={itemSearch}
            onChange={(e) => {
              setItemSearch(e.target.value);
              setShowItemDropdown(true);
            }}
            onFocus={() => setShowItemDropdown(true)}
            className="w-full pl-9 pr-4 py-2.5 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none text-sm"
          />
        </div>
        {showItemDropdown && filteredItems.length > 0 && (
          <div className="absolute z-20 mt-1 w-full bg-white border-2 border-gray-200 rounded-xl shadow-xl overflow-hidden max-h-64 overflow-y-auto">
            {filteredItems.map((item) => {
              const inCart = cart.find((c) => c.itemId === item.id);
              const stockTracked = isInventoryItemType(item.itemType);
              const outOfStock = stockTracked && item.quantity === 0;
              const canAdd = !stockTracked || !outOfStock || allowSaleOnZeroStock;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => canAdd && addToCart(item)}
                  disabled={!canAdd}
                  className={`w-full px-4 py-2.5 text-left border-b border-gray-100 last:border-0 flex items-center gap-3 ${
                    !canAdd
                      ? "opacity-50 cursor-not-allowed bg-gray-50"
                      : "hover:bg-blue-50 cursor-pointer"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">
                      {item.name}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                      <p className="text-xs text-blue-600 font-medium">
                        {item.manufacturer?.name || "Unknown"}
                      </p>
                      {!stockTracked && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                          {itemTypeLabel(item.itemType)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-gray-800 text-sm">
                      {formatCurrency(item.sellingPrice)}
                    </p>
                    <p
                      className={`text-xs ${
                        !stockTracked
                          ? "text-slate-500"
                          : outOfStock
                            ? "text-red-500"
                            : item.quantity <= 10
                              ? "text-amber-600"
                              : "text-gray-500"
                      }`}
                    >
                      {!stockTracked
                        ? "No stock tracking"
                        : outOfStock
                        ? allowSaleOnZeroStock ? "⚠ Out of stock" : "Out of stock"
                        : useUnitSystem && item.unitName
                          ? `${item.quantity} ${item.unitName}`
                          : `${item.quantity} left`}
                    </p>
                  </div>
                  {inCart && canAdd && (
                    <span className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {inCart.quantity}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        {showItemDropdown &&
          itemSearch.trim() &&
          filteredItems.length === 0 && (
            <div className="absolute z-20 mt-1 w-full bg-white border-2 border-gray-200 rounded-xl shadow-xl p-4 text-center text-sm text-gray-500">
              No items found matching &ldquo;{itemSearch}&rdquo;
            </div>
          )}
      </div>

      {/* Cart */}
      {cart.length > 0 && (
        <div className="bg-white rounded-2xl border-2 border-gray-200 overflow-hidden">
          {/* Cart header */}
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">
              Cart — {cart.length} item{cart.length !== 1 ? "s" : ""}
            </span>
            <button
              type="button"
              onClick={() => setCart([])}
              className="text-xs text-red-500 hover:text-red-700 font-semibold"
            >
              Clear all
            </button>
          </div>

          {/* Desktop table header */}
          <table className="hidden md:table w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                <th className="text-left pl-4 pr-2 py-2 font-semibold">Item</th>
                <th className="text-center px-2 py-2 font-semibold">
                  Quantity
                </th>
                <th className="text-right px-2 py-2 font-semibold">
                  Unit Price
                </th>
                {enableDiscounts && (
                  <th className="text-right px-2 py-2 font-semibold">Discount</th>
                )}
                <th className="text-right pl-2 pr-4 py-2 font-semibold w-24">
                  Subtotal
                </th>
                <th className="w-8 pr-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cart.map((item) => {
                const stockTracked = isInventoryItemType(item.itemType);
                const isCartonMode =
                  useUnitSystem && (item.piecesPerUnit ?? 1) > 1;
                const isWeightMode =
                  useUnitSystem &&
                  !!item.unitName &&
                  (item.piecesPerUnit ?? 1) <= 1;
                return (
                  <tr key={item.itemId} className="group hover:bg-gray-50/50">
                    {/* Item name */}
                    <td className="pl-4 pr-2 py-3 align-top">
                      <p className="font-semibold text-gray-900 text-sm truncate max-w-[200px]">
                        {item.name}
                      </p>
                      <p className="text-xs text-blue-500">
                        {item.manufacturer}
                      </p>
                      {isCartonMode && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {stockTracked
                            ? `= ${Math.round(item.quantity * (item.piecesPerUnit ?? 1))} pcs · stock ${item.maxStock} ${item.unitName ?? "ctn"}`
                            : "No stock tracking"}
                        </p>
                      )}
                      {isWeightMode && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {stockTracked ? `max ${item.maxStock} ${item.unitName}` : "No stock tracking"}
                        </p>
                      )}
                      {!isCartonMode && !isWeightMode && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {stockTracked ? `max ${item.maxStock}` : "No stock tracking"}
                        </p>
                      )}
                    </td>
                    {/* Quantity */}
                    <td className="px-2 py-3 align-middle">
                      <div className="flex flex-col items-center gap-1.5">
                        {isCartonMode ? (
                          <div className="flex items-center gap-1.5">
                            <Stepper
                              value={item.cartonsInput ?? 0}
                              min={0}
                              onDecrement={() =>
                                updateCartons(
                                  item.itemId,
                                  (item.cartonsInput ?? 0) - 1,
                                )
                              }
                              onIncrement={() =>
                                updateCartons(
                                  item.itemId,
                                  (item.cartonsInput ?? 0) + 1,
                                )
                              }
                              onChange={(v) => updateCartons(item.itemId, v)}
                              color="amber"
                            />
                            <span className="text-xs font-semibold text-amber-700">
                              {item.unitName ?? "ctn"}
                            </span>
                            <span className="text-gray-300">+</span>
                            <Stepper
                              value={item.piecesInput ?? 0}
                              min={0}
                              max={(item.piecesPerUnit ?? 1) - 1}
                              onDecrement={() =>
                                updatePieces(
                                  item.itemId,
                                  (item.piecesInput ?? 0) - 1,
                                )
                              }
                              onIncrement={() =>
                                updatePieces(
                                  item.itemId,
                                  (item.piecesInput ?? 0) + 1,
                                )
                              }
                              onChange={(v) => updatePieces(item.itemId, v)}
                            />
                            <span className="text-xs font-semibold text-gray-500">
                              pcs
                            </span>
                          </div>
                        ) : isWeightMode ? (
                          <div className="flex items-center gap-1.5">
                            <Stepper
                              value={item.quantity}
                              min={0}
                              max={stockTracked ? item.maxStock : undefined}
                              step={0.5}
                              onDecrement={() =>
                                updateQty(
                                  item.itemId,
                                  Math.max(
                                    0,
                                    parseFloat(
                                      (item.quantity - 0.5).toFixed(3),
                                    ),
                                  ),
                                )
                              }
                              onIncrement={() =>
                                updateQty(
                                  item.itemId,
                                  stockTracked
                                    ? Math.min(
                                        parseFloat(
                                          (item.quantity + 0.5).toFixed(3),
                                        ),
                                        item.maxStock,
                                      )
                                    : parseFloat(
                                        (item.quantity + 0.5).toFixed(3),
                                      ),
                                )
                              }
                              onChange={(v) =>
                                updateQty(
                                  item.itemId,
                                  stockTracked ? Math.min(v, item.maxStock) : v,
                                )
                              }
                              color="green"
                            />
                            <span className="text-sm font-semibold text-green-700">
                              {item.unitName}
                            </span>
                          </div>
                        ) : (
                          <Stepper
                            value={item.quantity}
                            min={1}
                            max={stockTracked ? item.maxStock : undefined}
                            onDecrement={() =>
                              updateQty(item.itemId, item.quantity - 1)
                            }
                            onIncrement={() =>
                              updateQty(item.itemId, item.quantity + 1)
                            }
                            onChange={(v) => updateQty(item.itemId, v)}
                          />
                        )}
                      </div>
                    </td>
                    {/* Unit Price */}
                    <td className="px-2 py-3 align-middle">
                      <div className="flex flex-col items-end gap-1">
                        {hasPriceTiers && (
                          <PriceTierPills
                            item={item}
                            onSelect={(t) => updatePriceTier(item.itemId, t)}
                          />
                        )}
                        <input
                          type="number"
                          value={item.price}
                          onChange={(e) =>
                            updatePrice(
                              item.itemId,
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          step="0.01"
                          min="0"
                          className="w-28 px-2.5 py-1.5 border-2 border-gray-200 rounded-lg text-sm font-bold bg-white focus:border-blue-500 focus:outline-none text-right"
                        />
                      </div>
                    </td>
                    {/* Per-line Discount */}
                    {enableDiscounts && (
                      <td className="px-2 py-3 align-middle">
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex border border-gray-200 rounded-lg overflow-hidden">
                            <button
                              type="button"
                              onClick={() => updateLineDiscountType(item.itemId, "percent")}
                              className={`px-2 py-0.5 text-xs font-bold transition-colors ${item.lineDiscountType === "percent" ? "bg-red-500 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
                            >%</button>
                            <button
                              type="button"
                              onClick={() => updateLineDiscountType(item.itemId, "amount")}
                              className={`px-2 py-0.5 text-xs font-bold transition-colors ${item.lineDiscountType === "amount" ? "bg-red-500 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
                            >₵</button>
                          </div>
                          <input
                            type="number"
                            value={item.discountAmount || ''}
                            onChange={(e) =>
                              updateDiscount(item.itemId, parseFloat(e.target.value) || 0)
                            }
                            placeholder="0"
                            step="0.01"
                            min="0"
                            max={item.lineDiscountType === "percent" ? 100 : item.price * item.quantity}
                            className="w-20 px-2.5 py-1.5 border-2 border-red-100 rounded-lg text-sm font-bold bg-white focus:border-red-400 focus:outline-none text-right text-red-600"
                          />
                        </div>
                      </td>
                    )}
                    {/* Subtotal */}
                    <td className="pl-2 pr-4 py-3 align-middle text-right">
                      <p className="text-sm font-bold text-gray-900 whitespace-nowrap">
                        {formatCurrency(Math.max(0, item.price * item.quantity - resolveLineDiscount(item)))}
                      </p>
                      {resolveLineDiscount(item) > 0 && (
                        <p className="text-xs text-red-500 line-through whitespace-nowrap">
                          {formatCurrency(item.price * item.quantity)}
                        </p>
                      )}
                    </td>
                    {/* Remove */}
                    <td className="pr-3 py-3 align-middle">
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.itemId)}
                        className="text-red-300 hover:text-red-500 text-lg leading-none transition-colors"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Mobile card list */}
          <div className="md:hidden divide-y divide-gray-100">
            {cart.map((item) => {
              const stockTracked = isInventoryItemType(item.itemType)
              const isCartonMode =
                useUnitSystem && (item.piecesPerUnit ?? 1) > 1;
              const isWeightMode =
                useUnitSystem &&
                !!item.unitName &&
                (item.piecesPerUnit ?? 1) <= 1;
              return (
                <div key={item.itemId} className="p-3 space-y-2.5">
                  {/* Row 1: name + total + remove */}
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">
                        {item.name}
                      </p>
                      <p className="text-xs text-blue-600">
                        {item.manufacturer}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-sm font-bold text-gray-900 block">
                        {formatCurrency(Math.max(0, item.price * item.quantity - resolveLineDiscount(item)))}
                      </span>
                      {resolveLineDiscount(item) > 0 && (
                        <span className="text-xs text-red-400 line-through block">
                          {formatCurrency(item.price * item.quantity)}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.itemId)}
                      className="text-red-400 hover:text-red-600 text-lg leading-none shrink-0 -mt-0.5"
                    >
                      ×
                    </button>
                  </div>

                  {/* Row 2: Quantity */}
                  {isCartonMode ? (
                    <div className="space-y-1.5">
                      {hasPriceTiers && (
                        <div>
                          <PriceTierPills
                            item={item}
                            onSelect={(t) => updatePriceTier(item.itemId, t)}
                          />
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-gray-400 mb-0.5 block">
                            {item.unitName ?? "Cartons"}
                          </label>
                          <Stepper
                            value={item.cartonsInput ?? 0}
                            min={0}
                            onDecrement={() =>
                              updateCartons(
                                item.itemId,
                                (item.cartonsInput ?? 0) - 1,
                              )
                            }
                            onIncrement={() =>
                              updateCartons(
                                item.itemId,
                                (item.cartonsInput ?? 0) + 1,
                              )
                            }
                            onChange={(v) => updateCartons(item.itemId, v)}
                            color="amber"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-400 mb-0.5 block">
                            Extra pcs
                          </label>
                          <Stepper
                            value={item.piecesInput ?? 0}
                            min={0}
                            max={(item.piecesPerUnit ?? 1) - 1}
                            onDecrement={() =>
                              updatePieces(
                                item.itemId,
                                (item.piecesInput ?? 0) - 1,
                              )
                            }
                            onIncrement={() =>
                              updatePieces(
                                item.itemId,
                                (item.piecesInput ?? 0) + 1,
                              )
                            }
                            onChange={(v) => updatePieces(item.itemId, v)}
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-gray-400">
                          {stockTracked
                            ? `= ${Math.round(item.quantity * (item.piecesPerUnit ?? 1))} pcs · stock ${item.maxStock}`
                            : "No stock tracking"}
                        </p>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={item.price}
                            onChange={(e) =>
                              updatePrice(
                                item.itemId,
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            step="0.01"
                            min="0"
                            className="w-20 px-2 py-1 border-2 border-gray-200 rounded-lg text-sm font-bold bg-white focus:border-blue-500 focus:outline-none text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <span className="text-xs text-gray-400">
                            /{item.unitName ?? "ctn"}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : isWeightMode ? (
                    <>
                      {hasPriceTiers && (
                        <div>
                          <PriceTierPills
                            item={item}
                            onSelect={(t) => updatePriceTier(item.itemId, t)}
                          />
                        </div>
                      )}
                      <div className="flex items-end justify-between">
                        <div className="flex flex-col">
                          <label className="text-[10px] text-gray-400 mb-0.5">
                            Qty ({item.unitName})
                          </label>
                          <Stepper
                            value={item.quantity}
                            min={0}
                            max={stockTracked ? item.maxStock : undefined}
                            step={0.5}
                            onDecrement={() =>
                              updateQty(
                                item.itemId,
                                Math.max(
                                  0,
                                  parseFloat((item.quantity - 0.5).toFixed(3)),
                                ),
                              )
                            }
                            onIncrement={() =>
                              updateQty(
                                item.itemId,
                                stockTracked
                                  ? Math.min(
                                      parseFloat((item.quantity + 0.5).toFixed(3)),
                                      item.maxStock,
                                    )
                                  : parseFloat((item.quantity + 0.5).toFixed(3)),
                              )
                            }
                            onChange={(v) =>
                              updateQty(item.itemId, stockTracked ? Math.min(v, item.maxStock) : v)
                            }
                            color="green"
                          />
                        </div>
                        <div className="flex flex-col items-end">
                          <label className="text-[10px] text-gray-400 mb-0.5">
                            Price/{item.unitName}
                          </label>
                          <input
                            type="number"
                            value={item.price}
                            onChange={(e) =>
                              updatePrice(
                                item.itemId,
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            step="0.01"
                            min="0"
                            className="w-20 px-2 py-1.5 border-2 border-gray-200 rounded-lg text-sm font-bold bg-white focus:border-blue-500 focus:outline-none text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </div>
                      </div>
                      <p className="text-xs text-gray-400">
                        {stockTracked ? `max ${item.maxStock} ${item.unitName}` : "No stock tracking"}
                      </p>
                    </>
                  ) : (
                    <>
                      {hasPriceTiers && (
                        <div>
                          <PriceTierPills
                            item={item}
                            onSelect={(t) => updatePriceTier(item.itemId, t)}
                          />
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Stepper
                          value={item.quantity}
                          min={1}
                          max={stockTracked ? item.maxStock : undefined}
                          onDecrement={() =>
                            updateQty(item.itemId, item.quantity - 1)
                          }
                          onIncrement={() =>
                            updateQty(item.itemId, item.quantity + 1)
                          }
                          onChange={(v) => updateQty(item.itemId, v)}
                        />
                        {stockTracked && (
                          <span className="text-xs text-gray-400 shrink-0">
                            /{item.maxStock}
                          </span>
                        )}
                        <input
                          type="number"
                          value={item.price}
                          onChange={(e) =>
                            updatePrice(
                              item.itemId,
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          step="0.01"
                          min="0"
                          className="w-20 px-2 py-1.5 border-2 border-gray-200 rounded-lg text-sm font-bold bg-white focus:border-blue-500 focus:outline-none text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>
                    </>
                  )}

                  {/* Per-line discount (mobile) */}
                  {enableDiscounts && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-red-500 font-semibold">Disc.</span>
                      <div className="flex border border-gray-200 rounded-lg overflow-hidden">
                        <button
                          type="button"
                          onClick={() => updateLineDiscountType(item.itemId, "percent")}
                          className={`px-2 py-1 text-xs font-bold transition-colors ${item.lineDiscountType === "percent" ? "bg-red-500 text-white" : "bg-white text-gray-500"}`}
                        >%</button>
                        <button
                          type="button"
                          onClick={() => updateLineDiscountType(item.itemId, "amount")}
                          className={`px-2 py-1 text-xs font-bold transition-colors ${item.lineDiscountType === "amount" ? "bg-red-500 text-white" : "bg-white text-gray-500"}`}
                        >₵</button>
                      </div>
                      <input
                        type="number"
                        value={item.discountAmount || ''}
                        onChange={(e) => updateDiscount(item.itemId, parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        step="0.01"
                        min="0"
                        max={item.lineDiscountType === "percent" ? 100 : item.price * item.quantity}
                        className="flex-1 px-2 py-1 border-2 border-red-100 rounded-lg text-sm font-bold bg-white focus:border-red-400 focus:outline-none text-right text-red-600 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Cart footer */}
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
            <span className="text-sm text-gray-500 font-medium">
              {cart.length} item{cart.length !== 1 ? "s" : ""}
            </span>
            <div className="text-right">
              {enableDiscounts && cart.some(c => resolveLineDiscount(c) > 0) && (
                <p className="text-xs text-red-500 font-medium">
                  Line discounts: −{formatCurrency(cart.reduce((s, c) => s + resolveLineDiscount(c), 0))}
                </p>
              )}
              <span className="text-base font-bold text-gray-800">
                Subtotal: {formatCurrency(subtotal)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Payment Section */}
      {cart.length > 0 && (
        <div
          className={`rounded-2xl border-2 p-5 space-y-4 ${paymentType === "CASH" ? "bg-blue-50 border-blue-200" : "bg-orange-50 border-orange-200"}`}
        >
          {enableDiscounts && (
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm text-gray-600">
                <span>Subtotal</span>
                <span className="font-semibold">
                  {formatCurrency(subtotal)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 whitespace-nowrap">
                  Discount
                </span>
                <div className="flex border-2 border-gray-200 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setDiscountType("percent")}
                    className={`px-2.5 py-1 text-xs font-bold transition-colors ${discountType === "percent" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                  >
                    %
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscountType("amount")}
                    className={`px-2.5 py-1 text-xs font-bold transition-colors ${discountType === "amount" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                  >
                    GH₵
                  </button>
                </div>
                <input
                  type="number"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder="0"
                  min="0"
                  max={discountType === "percent" ? 100 : subtotal}
                  step="0.01"
                  className="flex-1 px-2.5 py-1.5 border-2 border-gray-200 rounded-lg text-sm font-bold focus:border-blue-500 focus:outline-none text-right"
                />
                {discountAmount > 0 && (
                  <span className="text-sm font-semibold text-red-600 whitespace-nowrap">
                    −{formatCurrency(discountAmount)}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-between items-center border-t border-gray-200 pt-3">
            <span className="text-base font-bold text-gray-700">Total</span>
            <span className="text-3xl font-bold text-gray-900">
              {formatCurrency(totalAmount)}
            </span>
          </div>

          {paymentType === "CASH" ? (
            <>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Amount Received (GH₵)
                </label>
                <input
                  type="number"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  step="0.01"
                  min="0"
                  placeholder={
                    totalAmount > 0 ? totalAmount.toFixed(2) : "0.00"
                  }
                  className="w-full px-4 py-3 border-2 border-blue-200 rounded-xl focus:border-blue-500 focus:outline-none text-xl font-bold bg-white"
                />
              </div>
              {amountPaid !== "" && change >= 0 && (
                <div className="flex justify-between items-center bg-green-100 rounded-xl p-3">
                  <span className="text-sm font-semibold text-green-800">
                    Change to give:
                  </span>
                  <span className="text-xl font-bold text-green-700">
                    {formatCurrency(change)}
                  </span>
                </div>
              )}
              {amountPaid !== "" && change < 0 && (
                <div className="flex justify-between items-center bg-red-100 rounded-xl p-3">
                  <span className="text-sm font-semibold text-red-800">
                    Short by:
                  </span>
                  <span className="text-xl font-bold text-red-700">
                    {formatCurrency(Math.abs(change))}
                  </span>
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Deposit / Part Payment (GH₵){" "}
                  <span className="text-gray-400 font-normal">optional</span>
                </label>
                <input
                  type="number"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  step="0.01"
                  min="0"
                  max={totalAmount}
                  placeholder="0.00"
                  className="w-full px-4 py-3 border-2 border-orange-200 rounded-xl focus:border-orange-400 focus:outline-none text-xl font-bold bg-white"
                />
              </div>
              <div className="flex justify-between items-center bg-orange-100 rounded-xl p-3">
                <span className="text-sm font-semibold text-orange-800">
                  Credit amount owed:
                </span>
                <span className="text-xl font-bold text-orange-700">
                  {formatCurrency(Math.max(0, creditAmount))}
                </span>
              </div>
              {!selectedCustomer && (
                <p className="text-xs text-amber-700 bg-amber-100 px-3 py-2 rounded-lg font-medium">
                  ⚠ Please select a customer above for credit sales
                </p>
              )}
            </>
          )}
        </div>
      )}

      {formError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-medium">
          ⚠ {formError}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 pt-1">
        <button
          type="submit"
          disabled={isSubmitting || cart.length === 0}
          className={`flex-1 py-4 text-white text-base font-bold rounded-xl disabled:opacity-50 transition-all shadow-md ${
            paymentType === "CASH"
              ? "bg-blue-600 hover:bg-blue-700"
              : "bg-orange-500 hover:bg-orange-600"
          }`}
        >
          {isSubmitting
            ? "Processing..."
            : paymentType === "CASH"
              ? `💵 Complete Sale — ${formatCurrency(totalAmount)}`
              : `📋 Record Sale — ${formatCurrency(totalAmount)}`}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="sm:w-32 py-4 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

// Price tier pill buttons — shared helper
function PriceTierPills({
  item,
  onSelect,
}: {
  item: CartItem;
  onSelect: (tier: "default" | "retail" | "wholesale" | "promo") => void;
}) {
  const tiers: {
    tier: "default" | "retail" | "wholesale" | "promo";
    label: string;
    show: boolean;
  }[] = [
    { tier: "default", label: "Def", show: true },
    { tier: "retail", label: "Ret", show: item.retailPrice != null },
    { tier: "wholesale", label: "Whl", show: item.wholesalePrice != null },
    { tier: "promo", label: "Prm", show: item.promoPrice != null },
  ];
  return (
    <div className="flex gap-1">
      {tiers
        .filter((t) => t.show)
        .map(({ tier, label }) => (
          <button
            key={tier}
            type="button"
            onClick={() => onSelect(tier)}
            className={`px-1.5 py-0.5 rounded text-xs font-semibold border transition-colors ${
              item.priceTier === tier
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-500 border-gray-300 hover:border-blue-400"
            }`}
          >
            {label}
          </button>
        ))}
    </div>
  );
}
