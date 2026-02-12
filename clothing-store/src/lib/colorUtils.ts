// Color utilities: convert hex -> Lab and find nearest CSS named color using ΔE

type RGB = { r: number; g: number; b: number };
import colorNames from "./color-names.json";

const cssNamedColors: { name: string; hex: string }[] = Object.entries(
  colorNames as Record<string, string>,
).map(([hex, name]) => ({ name, hex: hex.toUpperCase() }));

// Precompute Lab values for named colors to avoid recalculating on every call
const namedColorLabs: {
  name: string;
  lab: { L: number; a: number; b: number };
}[] = cssNamedColors.map((c) => ({
  name: c.name,
  lab: rgbToLab(hexToRgb(c.hex)),
}));

// Simple memoization cache for recent lookups
const detectCache = new Map<string, string>();

function hexToRgb(hex: string): RGB {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean, 16);
  return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
}

function rgbToXyz({ r, g, b }: RGB) {
  // sRGB (0..255) -> linear RGB (0..1)
  const srgb = [r / 255, g / 255, b / 255].map((v) => {
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  const [R, G, B] = srgb;
  // Observer = 2°, Illuminant = D65
  const X = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
  const Y = R * 0.2126729 + G * 0.7151522 + B * 0.072175;
  const Z = R * 0.0193339 + G * 0.119192 + B * 0.9503041;
  return { X: X * 100, Y: Y * 100, Z: Z * 100 };
}

function xyzToLab({ X, Y, Z }: { X: number; Y: number; Z: number }) {
  // Reference white D65
  const refX = 95.047;
  const refY = 100.0;
  const refZ = 108.883;

  const x = X / refX;
  const y = Y / refY;
  const z = Z / refZ;

  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

  const L = 116 * f(y) - 16;
  const a = 500 * (f(x) - f(y));
  const b = 200 * (f(y) - f(z));
  return { L, a, b };
}

function rgbToLab(rgb: RGB) {
  return xyzToLab(rgbToXyz(rgb));
}

function deltaE(
  lab1: { L: number; a: number; b: number },
  lab2: { L: number; a: number; b: number },
) {
  const dL = lab1.L - lab2.L;
  const da = lab1.a - lab2.a;
  const db = lab1.b - lab2.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((x) => {
        const hex = Math.round(x).toString(16);
        return hex.length === 1 ? "0" + hex : hex;
      })
      .join("")
  );
}

// Extract dominant colors from an image
export function extractColorsFromImage(imageUrl: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }

        // Set canvas size to image size
        canvas.width = img.width;
        canvas.height = img.height;

        // Draw image on canvas
        ctx.drawImage(img, 0, 0);

        // Get image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Sample colors - take every nth pixel to avoid processing too many
        const sampleRate = Math.max(1, Math.floor(data.length / (4 * 1000))); // Sample ~1000 pixels
        const colors: { [key: string]: number } = {};

        for (let i = 0; i < data.length; i += 4 * sampleRate) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];

          // Skip transparent/semi-transparent pixels
          if (a < 128) continue;

          // Skip very light colors (likely background)
          if (r > 240 && g > 240 && b > 240) continue;

          // Skip very dark colors (likely shadows)
          if (r < 15 && g < 15 && b < 15) continue;

          const hex = rgbToHex(r, g, b);
          colors[hex] = (colors[hex] || 0) + 1;
        }

        // Sort colors by frequency and get top colors
        const sortedColors = Object.entries(colors)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 12) // Get top 12 colors
          .map(([hex]) => hex);

        // Remove very similar colors using color difference
        const distinctColors: string[] = [];
        for (const color of sortedColors) {
          const currentLab = rgbToLab(hexToRgb(color));
          let isDifferent = true;

          for (const existingColor of distinctColors) {
            const existingLab = rgbToLab(hexToRgb(existingColor));
            if (deltaE(currentLab, existingLab) < 15) {
              // Colors are too similar
              isDifferent = false;
              break;
            }
          }

          if (isDifferent) {
            distinctColors.push(color);
          }

          // Limit to 8 distinct colors
          if (distinctColors.length >= 8) break;
        }

        resolve(distinctColors);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => {
      reject(new Error("Could not load image"));
    };

    img.src = imageUrl;
  });
}

export function detectColorName(hex: string): string {
  try {
    const key = hex.toUpperCase();
    if (detectCache.has(key)) return detectCache.get(key)!;

    const target = rgbToLab(hexToRgb(key));
    let best = { name: "", dist: Number.POSITIVE_INFINITY };
    for (const c of namedColorLabs) {
      const d = deltaE(target, c.lab);
      if (d < best.dist) {
        best = { name: c.name, dist: d };
      }
    }

    detectCache.set(key, best.name);
    return best.name;
  } catch (e) {
    return "";
  }
}
