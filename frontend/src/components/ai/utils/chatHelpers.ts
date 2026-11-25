import type {
  HistoryItem,
  Message,
  TradaraAIContext
} from '../types';

export const buildHistory = (
  messages: Message[]
): HistoryItem[] =>
  messages
    .filter(
      (message) =>
        message.sender === 'user' ||
        message.sender === 'ai'
    )
    .slice(-20)
    .map((message) => ({
      role:
        message.sender === 'user'
          ? 'user'
          : 'model',
      parts: [
        {
          text: message.text
        }
      ]
    }));

export const resolveProductId = (
  initialContext?: TradaraAIContext
) =>
  initialContext?.productId ||
  initialContext?.itemId ||
  undefined;

export const buildProductPayload = (
  initialContext?: TradaraAIContext
) => {
  const productId = resolveProductId(initialContext);

  if (!productId) {
    return undefined;
  }

  const numericPrice =
    initialContext?.price !== undefined
      ? Number(
          String(initialContext.price).replace(
            /,/g,
            ''
          )
        )
      : undefined;

  return {
    id: productId,
    name: initialContext?.productName || undefined,
    listPrice:
      numericPrice !== undefined &&
      !Number.isNaN(numericPrice)
        ? numericPrice
        : undefined,
    currency: initialContext?.currency || 'â‚¦',
    category: initialContext?.category,
    description: initialContext?.description
  };
};
