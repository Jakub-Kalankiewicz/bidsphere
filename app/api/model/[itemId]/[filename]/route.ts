import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { signCanvasUrl } from "@/lib/cloudinary";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ itemId: string; filename: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { itemId } = await params;

  const item = await db.auctionItem.findUnique({
    where: { id: itemId },
    select: { pathToCanvas: true },
  });

  if (!item?.pathToCanvas) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const signedUrl = signCanvasUrl(item.pathToCanvas);

  const upstream = await fetch(signedUrl);
  if (!upstream.ok) {
    return new NextResponse("Failed to fetch model from storage", {
      status: upstream.status,
    });
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": "model/gltf-binary",
      // Private cache: browser can cache for 1h (matching signed URL expiry)
      // but intermediate proxies must not cache it
      "Cache-Control": "private, max-age=3600",
    },
  });
}
