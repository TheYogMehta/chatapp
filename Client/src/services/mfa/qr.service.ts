import QRCode from "qrcode";

export const qrService = {
  async toDataUrl(text: string): Promise<string> {
    return QRCode.toDataURL(text, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 220,
    });
  },
};

