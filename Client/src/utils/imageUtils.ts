import { Capacitor } from "@capacitor/core";

export const processProfileImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_SIZE = 256;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL("image/webp", 0.7);
        resolve(dataUrl);
      };
    };
    reader.onerror = (error) => reject(error);
  });
};

export const generateThumbnail = async (
  fileUri: string,
  mimeType: string,
): Promise<string | null> => {
  const isVideo = mimeType.startsWith("video/");
  const isImage = mimeType.startsWith("image/");

  if (!isImage && !isVideo) return null;

  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const media = isVideo ? document.createElement("video") : new Image();

    media.crossOrigin = "anonymous";
    const source = Capacitor.convertFileSrc(fileUri);

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Thumbnail timeout"));
    }, 10000);

    const cleanup = () => {
      clearTimeout(timeout);
      if (isVideo) {
        const v = media as HTMLVideoElement;
        v.pause();
        v.src = "";
        v.load();
      }
    };

    const process = () => {
      try {
        const targetWidth = 120;
        const originalWidth = isVideo
          ? (media as HTMLVideoElement).videoWidth
          : (media as HTMLImageElement).width;
        const originalHeight = isVideo
          ? (media as HTMLVideoElement).videoHeight
          : (media as HTMLImageElement).height;

        const scale = targetWidth / originalWidth;
        canvas.width = targetWidth;
        canvas.height = originalHeight * scale;

        ctx?.drawImage(media, 0, 0, canvas.width, canvas.height);

        const base64 = canvas.toDataURL("image/jpeg", 0.4);
        cleanup();
        resolve(base64.split(",")[1]);
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    if (isVideo) {
      const video = media as HTMLVideoElement;
      video.muted = true;
      video.playsInline = true;

      video.onloadeddata = () => {
        video.currentTime = Math.min(video.duration, 1);
      };
      video.onseeked = process;
      video.onerror = (e) => {
        cleanup();
        reject(e);
      };
      video.src = source;
      video.load();
    } else {
      const img = media as HTMLImageElement;
      img.onload = process;
      img.onerror = (e) => {
        cleanup();
        reject(e);
      };
      img.src = source;
    }
  });
};
