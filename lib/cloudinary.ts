import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

/**
 * Extracts the Cloudinary public_id, delivery type, and version from a full secure_url.
 * Handles both type="upload" and type="authenticated" URLs, with or without
 * an existing signature segment (s--...--) in the stored URL.
 */
export function extractPublicIdAndType(url: string): {
  publicId: string;
  type: "upload" | "authenticated";
  version?: string;
} {
  // Strip query string (e.g. ?_a=analytics_param)
  const cleanUrl = url.split("?")[0];

  // Authenticated: /authenticated/[s--sig--/][v{version}/]{public_id}
  const authMatch = cleanUrl.match(
    /\/authenticated\/(?:s--[^/]+--\/)?(?:v(\d+)\/)?(.+)$/
  );
  if (authMatch) {
    return { publicId: authMatch[2], type: "authenticated", version: authMatch[1] };
  }

  // Upload: /upload/[s--sig--/][v{version}/]{public_id}
  const uploadMatch = cleanUrl.match(
    /\/upload\/(?:s--[^/]+--\/)?(?:v(\d+)\/)?(.+)$/
  );
  if (uploadMatch) {
    return { publicId: uploadMatch[2], type: "upload", version: uploadMatch[1] };
  }

  throw new Error(`Cannot extract public_id from Cloudinary URL: ${url}`);
}

/**
 * Generates a signed Cloudinary delivery URL for a raw asset.
 * Automatically detects whether the asset is type="upload" or type="authenticated".
 * Access and expiry semantics depend on the asset type and Cloudinary configuration.
 */
export function signCanvasUrl(publicUrl: string): string {
  const { publicId, type, version } = extractPublicIdAndType(publicUrl);

  return cloudinary.url(publicId, {
    sign_url: true,
    secure: true,
    type,
    resource_type: "raw",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    ...(version ? { version } : {}),
  });
}
