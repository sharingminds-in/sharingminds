const ZERO_DECIMAL_CURRENCIES = new Set(['JPY']);

export class PaymentAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentAmountError';
  }
}

export function normalizeCurrency(currency: string | null | undefined) {
  const normalized = (currency || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new PaymentAmountError(`Invalid payment currency "${currency}".`);
  }
  return normalized;
}

export function assertRazorpayCurrency(currency: string | null | undefined) {
  const normalized = normalizeCurrency(currency);
  if (normalized !== 'INR') {
    throw new PaymentAmountError(
      `Razorpay payments are currently enabled only for INR. Received ${normalized}.`
    );
  }
  return normalized;
}

export function toCurrencySubunits(amount: number, currency: string) {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new PaymentAmountError('Payment amount must be a non-negative number.');
  }

  const normalizedCurrency = normalizeCurrency(currency);
  const multiplier = ZERO_DECIMAL_CURRENCIES.has(normalizedCurrency) ? 1 : 100;
  const subunits = Math.round(amount * multiplier);

  if (Math.abs(subunits / multiplier - amount) > 0.000001) {
    throw new PaymentAmountError(
      `Payment amount ${amount} cannot be represented exactly for ${normalizedCurrency}.`
    );
  }

  return subunits;
}

export function assertPositiveSubunitAmount(amountSubunits: number) {
  if (!Number.isInteger(amountSubunits) || amountSubunits <= 0) {
    throw new PaymentAmountError('Payment amount must be greater than zero.');
  }
}

export function assertRazorpayPaymentAmount(
  currency: string,
  amountSubunits: number
) {
  assertRazorpayCurrency(currency);
  assertPositiveSubunitAmount(amountSubunits);

  if (currency === 'INR' && amountSubunits < 100) {
    throw new PaymentAmountError('Razorpay INR payments must be at least INR 1.00.');
  }
}
