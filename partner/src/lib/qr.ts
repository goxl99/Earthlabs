import QRCode from "qrcode";

/** Public page a certificate QR code points to. */
export const verifyUrl = (origin: string, basePath: string, code: string) =>
  `${origin.replace(/\/$/, "")}${basePath.replace(/\/$/, "")}/verify/?code=${encodeURIComponent(code.trim().toUpperCase())}`;

/** SVG markup of the QR code (scales to any print size). */
export const qrSvg = (url: string) => QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
