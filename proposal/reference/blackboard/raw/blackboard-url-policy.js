export const BLACKBOARD_BLOCKED_URL = "#blocked";

const ABSOLUTE_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const SAFE_DATA_IMAGE_RE = /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i;

const currentBaseUrl = () => {
  try {
    return globalThis.location?.href || "https://resonantos.local/";
  } catch {
    return "https://resonantos.local/";
  }
};

function normalizeUrl(value, {
  allowDataImage = false,
  allowRelative = true,
  protocols = ["https:", "http:"]
} = {}) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  if (allowDataImage && SAFE_DATA_IMAGE_RE.test(raw)) {
    return raw.replace(/\s+/g, "");
  }

  if (!allowRelative && !ABSOLUTE_SCHEME_RE.test(raw)) {
    return BLACKBOARD_BLOCKED_URL;
  }

  try {
    const parsed = ABSOLUTE_SCHEME_RE.test(raw)
      ? new URL(raw)
      : new URL(raw, currentBaseUrl());
    return protocols.includes(parsed.protocol) ? parsed.href : BLACKBOARD_BLOCKED_URL;
  } catch {
    return BLACKBOARD_BLOCKED_URL;
  }
}

export function isBlockedBlackboardUrl(value) {
  return value === BLACKBOARD_BLOCKED_URL;
}

export function sanitizeBlackboardLinkUrl(value) {
  return normalizeUrl(value, {
    allowRelative: true,
    protocols: ["https:", "http:", "mailto:", "chrome-extension:"]
  });
}

export function sanitizeBlackboardEmbedUrl(value) {
  return normalizeUrl(value, {
    allowRelative: false,
    protocols: ["https:", "http:"]
  });
}

export function sanitizeBlackboardImageUrl(value) {
  return normalizeUrl(value, {
    allowDataImage: true,
    allowRelative: true,
    protocols: ["https:", "http:", "blob:", "chrome-extension:"]
  });
}
