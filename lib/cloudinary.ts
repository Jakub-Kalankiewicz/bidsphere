import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

/**
 * Extracts the Cloudinary public_id from a full secure_url.
 * Input:  "https://res.cloudinary.com/cloud/raw/upload/v1234567890/bidsphere/canvas/model.glb"
 * Output: "bidsphere/canvas/model.glb"
 */
export function extractPublicId(url: string): string {
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)$/);
  if (!match) {
    throw new Error(`Cannot extract public_id from Cloudinary URL: ${url}`);
  }
  return match[1];
}

/**
 * Generates a signed, time-limited URL for a raw Cloudinary asset.
 * The URL expires in 1 hour and includes an HMAC signature validated by Cloudinary.
 */
export function signCanvasUrl(publicUrl: string): string {
  const publicId = extractPublicId(publicUrl);

  return cloudinary.url(publicId, {
    sign_url: true,
    secure: true,
    type: "upload",
    resource_type: "raw",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  });
}
