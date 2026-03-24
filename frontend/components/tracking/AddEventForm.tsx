"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useState } from "react";
import { toast } from "sonner";
import { Contract, rpc, TransactionBuilder, xdr, nativeToScVal } from "@stellar/stellar-sdk";
import {
  getWalletAddress,
  signTransaction,
  CONTRACT_ID,
  RPC_URL,
  NETWORK_PASSPHRASE,
} from "@/lib/stellar/client";

const eventSchema = z.object({
  productId: z.string().min(1, "Product ID is required"),
  location: z.string().min(2, "Location must be at least 2 characters"),
  eventType: z.enum(["HARVEST", "PROCESSING", "SHIPPING", "RETAIL"]),
  metadata: z.string().refine(
    (val) => {
      try {
        if (!val.trim()) return true; // allow empty to be parsed as '{}' or ignore? Wait, empty metadata is allowed or not?
        // the task says: Metadata (JSON textarea with syntax validation). Valid JSON.
        JSON.parse(val);
        return true;
      } catch (e) {
        return false;
      }
    },
    { message: "Invalid JSON format" }
  ),
});

type EventFormValues = z.infer<typeof eventSchema>;

interface AddEventFormProps {
  productId: string;
  onSuccess?: () => void;
}

export function AddEventForm({ productId, onSuccess }: AddEventFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      productId: productId,
      location: "",
      eventType: "HARVEST",
      metadata: "{\n  \n}",
    },
  });

  const onSubmit = async (data: EventFormValues) => {
    setIsSubmitting(true);
    try {
      const userAddress = await getWalletAddress();
      if (!userAddress) {
        toast.error("Please connect your Freighter wallet first");
        setIsSubmitting(false);
        return;
      }

      const server = new rpc.Server(RPC_URL);
      const contract = new Contract(CONTRACT_ID);

      const sourceAccount = await server.getAccount(userAddress);
      
      const tx = new TransactionBuilder(sourceAccount, {
        fee: "1000",
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(
          contract.call(
            "add_tracking_event",
            xdr.ScVal.scvString(data.productId),
            xdr.ScVal.scvString(data.location),
            xdr.ScVal.scvString(data.eventType),
            xdr.ScVal.scvString(data.metadata)
          )
        )
        .setTimeout(30)
        .build();

      const preparedTx = await server.prepareTransaction(tx);
      
      let signedTxXdr;
      if (typeof signTransaction === "function") {
         const response = await signTransaction(preparedTx.toXDR(), {
          networkPassphrase: NETWORK_PASSPHRASE,
        });
        signedTxXdr = typeof response === "string" ? response : (response as any).signedTxXdr;
        if (!signedTxXdr && (response as any).error) {
          throw new Error((response as any).error);
        }
      } else {
        throw new Error("signTransaction is not available");
      }

      const signedTx = TransactionBuilder.fromXDR(signedTxXdr, NETWORK_PASSPHRASE);
      const submitResponse = await server.submitTransaction(signedTx);

      if (submitResponse.status === "SUCCESS") {
        toast.success("Event added successfully!", {
          description: "Transaction confirmed on-chain.",
          action: {
            label: "View Tracker",
            onClick: () =>
              window.open(
                `https://stellar.expert/explorer/testnet/tx/${submitResponse.hash}`,
                "_blank"
              ),
          },
        });
        if (onSuccess) onSuccess();
      } else {
        throw new Error("Transaction failed on-chain: " + ((submitResponse as any).errorResultXdr || "unknown error"));
      }
    } catch (error: any) {
      console.error(error);
      toast.error("Failed to submit event: " + (error?.message || "Unknown error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-md w-full bg-white dark:bg-zinc-900 border dark:border-zinc-800 p-6 rounded-lg shadow-sm">
      <h2 className="text-xl font-semibold mb-4">Add Tracking Event</h2>

      <div>
        <label className="block text-sm font-medium mb-1">Product ID</label>
        <input
          type="text"
          readOnly
          {...register("productId")}
          className="w-full px-3 py-2 border rounded-md bg-gray-50 dark:bg-zinc-800 dark:border-zinc-700 text-gray-500 cursor-not-allowed"
        />
        {errors.productId && (
          <p className="text-red-500 text-xs mt-1">{errors.productId.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Location</label>
        <input
          type="text"
          placeholder="e.g. Farm A, Warehouse B"
          {...register("location")}
          className="w-full px-3 py-2 border rounded-md bg-white dark:bg-zinc-900 dark:border-zinc-700"
        />
        {errors.location && (
          <p className="text-red-500 text-xs mt-1">{errors.location.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Event Type</label>
        <select
          {...register("eventType")}
          className="w-full px-3 py-2 border rounded-md bg-white dark:bg-zinc-900 dark:border-zinc-700"
        >
          <option value="HARVEST">Harvest</option>
          <option value="PROCESSING">Processing</option>
          <option value="SHIPPING">Shipping</option>
          <option value="RETAIL">Retail</option>
        </select>
        {errors.eventType && (
          <p className="text-red-500 text-xs mt-1">{errors.eventType.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Metadata (JSON)</label>
        <textarea
          rows={4}
          {...register("metadata")}
          className="w-full font-mono text-sm px-3 py-2 border rounded-md bg-white dark:bg-zinc-900 dark:border-zinc-700"
          placeholder='{"temperature": "4°C"}'
        />
        {errors.metadata && (
          <p className="text-red-500 text-xs mt-1">{errors.metadata.message}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-black dark:bg-white text-white dark:text-black font-medium py-2 px-4 rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {isSubmitting ? "Submitting..." : "Submit Event"}
      </button>
    </form>
  );
}
