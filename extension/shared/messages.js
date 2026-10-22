(() => {
  "use strict";
  const ns = globalThis.TikTokTools = globalThis.TikTokTools || {};

  const types = Object.freeze({
    // Player / tab
    PLAYER_STATUS: "PLAYER_STATUS",
    MIRROR_TOGGLE: "MIRROR_TOGGLE",
    SPEED_SET: "SPEED_SET",
    CAPTURE_FRAME: "CAPTURE_FRAME",
    CAPTURE_REGION: "CAPTURE_REGION",
    RESOLVE_VIDEO: "RESOLVE_VIDEO",
    COLLECT_STATE: "COLLECT_STATE",
    // Settings
    SETTINGS_PATCH: "SETTINGS_PATCH",
    SETTINGS_READ: "SETTINGS_READ",
    // Download
    DOWNLOAD_RESOLVE: "DOWNLOAD_RESOLVE",
    DOWNLOAD_START: "DOWNLOAD_START",
    DOWNLOAD_STATUS: "DOWNLOAD_STATUS",
    DOWNLOAD_CANCEL: "DOWNLOAD_CANCEL",
    // Equalizer
    EQ_START: "EQ_START",
    EQ_SET_PRESET: "EQ_SET_PRESET",
    EQ_STOP: "EQ_STOP",
    EQ_STATUS: "EQ_STATUS"
  });

  const errorCodes = Object.freeze({
    NO_TAB: "NO_TAB",
    NO_RECEIVER: "NO_RECEIVER",
    NO_VIDEO: "NO_VIDEO",
    NO_FRAME: "NO_FRAME",
    CAPTURE_FAILED: "CAPTURE_FAILED",
    INVALID_URL: "INVALID_URL",
    INVALID_HOST: "INVALID_HOST",
    INVALID_PATH: "INVALID_PATH",
    NOT_FOUND: "NOT_FOUND",
    LOGIN_REQUIRED: "LOGIN_REQUIRED",
    NO_SOURCE: "NO_SOURCE",
    DUPLICATE: "DUPLICATE",
    UNSUPPORTED: "UNSUPPORTED",
    BAD_REQUEST: "BAD_REQUEST",
    NOT_IMPLEMENTED: "NOT_IMPLEMENTED",
    BLOCKED: "BLOCKED",
    TIMEOUT: "TIMEOUT",
    UNKNOWN: "UNKNOWN"
  });

  let sequence = 0;

  ns.messages = Object.freeze({
    types,
    errorCodes,
    ok(data) {
      return { ok: true, data };
    },
    fail(code, message) {
      return { ok: false, error: { code: code || errorCodes.UNKNOWN, message: message || "Đã xảy ra lỗi." } };
    },
    nextRequestId(prefix = "r") {
      sequence += 1;
      return `${prefix}-${Date.now().toString(36)}-${sequence}`;
    },
    isResponse(value) {
      return Boolean(value) && typeof value === "object" && typeof value.ok === "boolean";
    }
  });
})();
