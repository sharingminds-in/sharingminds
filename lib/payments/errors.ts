export class PaymentServiceError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly data?: unknown
  ) {
    super(message);
    this.name = 'PaymentServiceError';
  }
}

export function assertPayment(
  condition: unknown,
  status: number,
  message: string,
  data?: unknown
): asserts condition {
  if (!condition) {
    throw new PaymentServiceError(status, message, data);
  }
}
