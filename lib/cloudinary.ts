import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

/**
 * Extracts the Cloudinary public_id and delivery type from a full secure_url.
 * Handles both type="upload" and type="authenticated" URLs.
 */
export function extractPublicIdAndType(url: string): {
  publicId: string;
  type: "upload" | "authenticated";
} {
  const authMatch = url.match(/\/authenticated\/(?:v\d+\/)?(.+)$/);
  if (authMatch) return { publicId: authMatch[1], type: "authenticated" };

  const uploadMatch = url.match(/\/upload\/(?:v\d+\/)?(.+)$/);
  if (uploadMatch) return { publicId: uploadMatch[1], type: "upload" };

  throw new Error(`Cannot extract public_id from Cloudinary URL: ${url}`);
}

/**
 * Generates a signed, time-limited URL for a raw Cloudinary asset.
 * Automatically detects whether the asset is type="upload" or type="authenticated".
 * The URL expires in 1 hour and includes an HMAC signature validated by Cloudinary.
 */
export function signCanvasUrl(publicUrl: string): string {
  const { publicId, type } = extractPublicIdAndType(publicUrl);

  return cloudinary.url(publicId, {
    sign_url: true,
    secure: true,
    type,
    resource_type: "raw",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  });
}
