import type { NextApiRequest, NextApiResponse } from "next";
import { IncomingForm } from "formidable";
import AdmZip from "adm-zip";
import fs from "fs/promises";
import path from "path";
import { currentRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";

export const config = {
  api: {
    bodyParser: false,
  },
};

export async function POST(req: NextApiRequest, res: NextApiResponse) {
  const role = await currentRole();

  if (role !== UserRole.ADMIN) {
    return new NextResponse(null, { status: 403 });
  }

  const data = await new Promise((resolve, reject) => {
    const form = new IncomingForm();

    // Note: The req here is typed as NextApiRequest, but formidable can parse it because it's compatible with IncomingMessage
    form.parse(req, async (err, fields, files: any) => {
      console.log("form", files);
      // Type 'any' is used temporarily
      if (err) return reject(err);

      // Access the uploaded file; the handling here may need to be adjusted based on how formidable returns files
      const zipFile = files.zipFile; // This is assuming the field name is 'zipFile'
      if (!zipFile) return reject(new Error("Zip file not found"));

      // Check if 'zipFile' is an array and access the first item if so
      const zipFilePath = Array.isArray(zipFile)
        ? zipFile[0].filepath
        : zipFile.filepath;

      const zip = new AdmZip(zipFilePath);
      const extractPath = path.resolve("./public/unpacked");

      // Ensure the extraction path exists
      await fs.mkdir(extractPath, { recursive: true });

      // Extract the ZIP file
      zip.extractAllTo(extractPath, true);

      resolve({ fields, files });
    });
  });
  return new NextResponse("File uploaded and extracted successfully", {
    status: 200,
  });
}
