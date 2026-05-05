const SCHEME_PATTERN = /^[a-z][a-z\d+\-.]*:/i;
const HTTP_SCHEME_PATTERN = /^https?:\/\//i;

export type ExternalUrlParseResult =
  | { success: true; url: string }
  | { success: false; error: string };

export type UrlContentDetailsInput = {
  title?: string | null;
  description?: string | null;
  url?: string | null;
  urlTitle?: string | null;
  urlDescription?: string | null;
};

export type UrlContentDetailsResult =
  | {
      success: true;
      title: string;
      description: string;
      url: string;
    }
  | { success: false; error: string };

export function normalizeExternalUrl(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? '';

  if (!trimmed) {
    return '';
  }

  if (SCHEME_PATTERN.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

export function parseExternalUrl(value: string | null | undefined): ExternalUrlParseResult {
  const url = normalizeExternalUrl(value);

  if (!url) {
    return { success: false, error: 'URL is required' };
  }

  if (!HTTP_SCHEME_PATTERN.test(url)) {
    return { success: false, error: 'URL must start with http:// or https://' };
  }

  try {
    new URL(url);
    return { success: true, url };
  } catch {
    return { success: false, error: 'Please enter a valid URL' };
  }
}

export function isValidExternalUrl(value: string | null | undefined): boolean {
  return parseExternalUrl(value).success;
}

export function resolveUrlContentDetails(
  input: UrlContentDetailsInput
): UrlContentDetailsResult {
  const parsedUrl = parseExternalUrl(input.url);

  if (!parsedUrl.success) {
    return parsedUrl;
  }

  const title =
    input.title?.trim() ||
    input.urlTitle?.trim() ||
    parsedUrl.url;
  const description =
    input.description?.trim() ||
    input.urlDescription?.trim() ||
    '';

  return {
    success: true,
    title,
    description,
    url: parsedUrl.url,
  };
}
