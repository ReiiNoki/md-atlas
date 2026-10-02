export const assetUrl = (path) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;

export async function readStaticJson(path, signal) {
  const response = await fetch(assetUrl(path), { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
