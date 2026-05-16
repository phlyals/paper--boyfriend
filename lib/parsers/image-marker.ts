const markerPattern = /\[IMAGE:\s*([^\]]+)\]/gi;

export function extractImageMarkers(text: string): { cleaned: string; markers: string[] } {
  const markers: string[] = [];
  const cleaned = text
    .replace(markerPattern, (_match, description: string) => {
      const trimmed = description.trim();
      if (trimmed) markers.push(trimmed);
      return "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { cleaned, markers };
}

export function stripImageMarkers(text: string): string {
  return extractImageMarkers(text).cleaned;
}
