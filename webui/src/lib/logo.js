// Logo-Verarbeitung im Browser (Canvas): Größe, Analyse, Kontur, Fläche, Upload

export async function loadImage(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

export function imageToCanvas(img, maxW) {
  let w = img.naturalWidth || 600, h = img.naturalHeight || 200;
  const scale = Math.min(1, maxW / w);
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(h * scale));
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c;
}

export function analyzeCanvas(c) {
  const data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let transparent = 0, opaque = 0, lum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 250) transparent++;
    if (a > 128) {
      opaque++;
      lum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    }
  }
  return { transparent: transparent / (data.length / 4) > 0.02, lum: opaque ? lum / opaque : 1 };
}

export function outlineCanvas(src) {
  const r = Math.max(2, Math.round(src.width / 90));
  const sil = document.createElement("canvas");
  sil.width = src.width; sil.height = src.height;
  const sc = sil.getContext("2d");
  sc.drawImage(src, 0, 0);
  sc.globalCompositeOperation = "source-in";
  sc.fillStyle = "#ffffff";
  sc.fillRect(0, 0, sil.width, sil.height);
  const out = document.createElement("canvas");
  out.width = src.width + 2 * r; out.height = src.height + 2 * r;
  const oc = out.getContext("2d");
  for (let a = 0; a < 360; a += 12) oc.drawImage(sil, r + Math.cos((a * Math.PI) / 180) * r, r + Math.sin((a * Math.PI) / 180) * r);
  oc.drawImage(src, r, r);
  return out;
}

export function plateCanvas(src) {
  const p = Math.max(8, Math.round(Math.min(src.width, src.height) * 0.12));
  const out = document.createElement("canvas");
  out.width = src.width + 2 * p; out.height = src.height + 2 * p;
  const oc = out.getContext("2d");
  oc.fillStyle = "#ffffff";
  oc.beginPath();
  oc.roundRect(0, 0, out.width, out.height, Math.round(p * 0.8));
  oc.fill();
  oc.drawImage(src, p, p);
  return out;
}

export async function uploadCanvas(c) {
  const blob = await new Promise((res) => c.toBlob(res, "image/png"));
  const res = await fetch("/api/assets", {
    method: "POST", credentials: "same-origin", body: blob,
    headers: { "Content-Type": "image/png", "X-Requested-With": "sigui" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Upload fehlgeschlagen");
  return data;
}

export async function fileToAsset(file) {
  if (file.size > 8 * 1024 * 1024) throw new Error("Datei zu groß (max. 8 MB)");
  const url = URL.createObjectURL(file);
  try {
    // 600 px reichen für bis zu 300 px Anzeigebreite auf Retina-Displays
    return await uploadCanvas(imageToCanvas(await loadImage(url), 600));
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Kontur oder Fläche anwenden, neues Asset hochladen; liefert {asset, ratio}
export async function transformAsset(localUrl, kind) {
  const img = await loadImage(localUrl);
  const out = (kind === "outline" ? outlineCanvas : plateCanvas)(imageToCanvas(img, 2000));
  const ratio = out.width / (img.naturalWidth || out.width);
  const asset = await uploadCanvas(imageToCanvas(await loadImage(out.toDataURL("image/png")), 640));
  return { asset, ratio };
}
