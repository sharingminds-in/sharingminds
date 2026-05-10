'use client';

import { useCallback } from 'react';

import type {
  PaymentCheckoutPayload,
  PaymentVerificationResult,
  RazorpayCheckoutResponse,
} from '@/lib/payments/types';
import { useTRPCClient } from '@/lib/trpc/react';

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: (response: unknown) => void) => void;
    };
  }
}

let checkoutScriptPromise: Promise<void> | null = null;

function loadRazorpayCheckout() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Razorpay Checkout can only run in a browser.'));
  }

  if (window.Razorpay) {
    return Promise.resolve();
  }

  if (!checkoutScriptPromise) {
    checkoutScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Razorpay Checkout.'));
      document.body.appendChild(script);
    });
  }

  return checkoutScriptPromise;
}

export function useRazorpayCheckout() {
  const trpcClient = useTRPCClient();

  return useCallback(
    async (
      payload: PaymentCheckoutPayload
    ): Promise<PaymentVerificationResult | PaymentCheckoutPayload> => {
      if (payload.status !== 'requires_checkout') {
        return payload;
      }

      if (payload.provider !== 'razorpay') {
        return payload;
      }

      if (!payload.intentId || !payload.keyId) {
        throw new Error('Payment checkout payload is incomplete.');
      }

      await loadRazorpayCheckout();

      return new Promise((resolve, reject) => {
        const RazorpayConstructor = window.Razorpay;
        if (!RazorpayConstructor) {
          reject(new Error('Razorpay Checkout failed to initialize.'));
          return;
        }

        const checkout = new RazorpayConstructor({
          key: payload.keyId,
          amount: payload.amountSubunits,
          currency: payload.currency,
          name: payload.name,
          description: payload.description,
          order_id: payload.orderId,
          subscription_id: payload.subscriptionId,
          prefill: payload.prefill,
          notes: payload.notes,
          theme: {
            color: '#2563eb',
          },
          handler: async (response: RazorpayCheckoutResponse) => {
            try {
              const result = await trpcClient.payments.verify.mutate({
                intentId: payload.intentId!,
                ...response,
              });
              resolve(result);
            } catch (error) {
              reject(error);
            }
          },
          modal: {
            ondismiss: () => {
              reject(new Error('Payment checkout was closed before completion.'));
            },
          },
        });

        checkout.on('payment.failed', (response) => {
          reject(
            new Error(
              typeof response === 'object' && response && 'error' in response
                ? String((response as any).error?.description || 'Payment failed')
                : 'Payment failed'
            )
          );
        });

        checkout.open();
      });
    },
    [trpcClient]
  );
}
