"use client";

import { useState, type ChangeEvent } from "react";

interface ProductActionsProps {
  productId: string;
}

type ModalType = "event" | "transfer" | "actor" | "deactivate" | null;

export default function ProductActions({ productId }: ProductActionsProps) {
  const [open, setOpen] = useState<ModalType>(null);
  const [input, setInput] = useState("");

  const close = () => { setOpen(null); setInput(""); };

  const handleSubmit = (action: ModalType) => {
    // TODO: wire up to smart contract calls
    console.log(`Action: ${action}, productId: ${productId}, input: ${input}`);
    close();
  };

  const ACTIONS: { label: string; type: ModalType; variant: string }[] = [
    { label: "Add Event", type: "event", variant: "bg-black text-white hover:bg-gray-800" },
    { label: "Transfer Ownership", type: "transfer", variant: "bg-blue-600 text-white hover:bg-blue-700" },
    { label: "Add Authorized Actor", type: "actor", variant: "bg-green-600 text-white hover:bg-green-700" },
    { label: "Deactivate", type: "deactivate", variant: "bg-red-600 text-white hover:bg-red-700" },
  ];

  const MODAL_CONFIG: Record<NonNullable<ModalType>, { title: string; placeholder: string }> = {
    event: { title: "Add Tracking Event", placeholder: "Event details (JSON)" },
    transfer: { title: "Transfer Ownership", placeholder: "New owner Stellar address" },
    actor: { title: "Add Authorized Actor", placeholder: "Actor Stellar address" },
    deactivate: { title: "Deactivate Product", placeholder: "Reason (optional)" },
  };

  return (
    <>
      <div className="flex flex-wrap gap-3">
        {ACTIONS.map(({ label, type, variant }) => (
          <button
            key={type}
            onClick={() => setOpen(type)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${variant}`}
          >
            {label}
          </button>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-semibold mb-4 text-[var(--foreground)]">{MODAL_CONFIG[open as NonNullable<ModalType>].title}</h2>
            <textarea
              className="w-full border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] rounded-md p-3 text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              placeholder={MODAL_CONFIG[open as NonNullable<ModalType>].placeholder}
              value={input}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
            />
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={close} className="px-4 py-2 text-sm rounded-md border border-[var(--card-border)] hover:bg-[var(--muted-bg)] text-[var(--foreground)]">
                Cancel
              </button>
              <button
                onClick={() => handleSubmit(open)}
                className="px-4 py-2 text-sm rounded-md bg-[var(--primary)] text-[var(--primary-fg)] hover:opacity-90"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
