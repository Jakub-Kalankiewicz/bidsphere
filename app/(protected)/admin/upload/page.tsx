"use client";

import { RoleGate } from "@/components/auth/RoleGate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { CldUploadButton } from "next-cloudinary";
import {
  Form,
  FormField,
  FormControl,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { AdminSchema } from "@/schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { UserRole } from "@prisma/client";
import { useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { adminUpload } from "@/actions/admin/upload";
import { toast } from "sonner";

const AdminUploadPage = () => {
  const [isPending, startTransition] = useTransition();
  const [image, setImage] = useState("");
  const [canvas, setCanvas] = useState("");
  const form = useForm<z.infer<typeof AdminSchema>>({
    resolver: zodResolver(AdminSchema),
    defaultValues: {
      name: "",
      startingPrice: 1,
      pathToImage: "",
      pathToCanvas: "",
      description: "",
    },
  });

  const handleImageUpload = (result: any) => {
    setImage(result.info.secure_url);
    form.setValue("pathToImage", result.info.secure_url);
  };
  const handleCanvasUpload = (result: any) => {
    setCanvas(result.info.secure_url);
    form.setValue("pathToCanvas", result.info.secure_url);
  };

  const onSubmit = (values: z.infer<typeof AdminSchema>) => {
    startTransition(() => {
      adminUpload(values)
        .then((data) => {
          if (data.error) {
            toast.error(data.error);
          }
          if (data.success) {
            toast.success(data.success);
            setCanvas("");
            setImage("");
            form.reset();
          }
        })
        .catch((error: any) => toast.error(error.message));
    });
  };

  return (
    <Card className="w-[600px] mt-[100px]">
      <CardHeader>
        <p className="text-2xl font-semibold text-center">🔑 Admin</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <RoleGate allowedRole={UserRole.ADMIN}>
          <Form {...form}>
            <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
              <div>
                <p className="text-sm font-semibold">Upload image</p>
                <div className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-md">
                  {!image ? (
                    <CldUploadButton
                      options={{
                        maxFiles: 1,
                        resourceType: "auto",
                        folder: "bidsphere/images",
                        tags: ["admin-upload/image"],
                      }}
                      onSuccess={handleImageUpload}
                      uploadPreset="bchnqu1n"
                      className="h-8 rounded-md px-8 bg-sky-300 text-accent-foreground shadow hover:bg-sky-300/80 hover:text-black text-white transition-all inline-flex items-center justify-center whitespace-nowrap text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                    >
                      Attach Image
                    </CldUploadButton>
                  ) : (
                    <p>{image.slice(0, 50)}...</p>
                  )}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold">Upload 3D image</p>
                <div className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-md">
                  {!canvas.length ? (
                    <CldUploadButton
                      options={{
                        maxFiles: 1,
                        resourceType: "raw",
                        folder: "bidsphere/canvas",
                        tags: ["admin-upload/canvas"],
                      }}
                      onSuccess={handleCanvasUpload}
                      uploadPreset="bchnqu1n"
                      className="h-8 rounded-md px-8 bg-sky-300 text-accent-foreground shadow hover:bg-sky-300/80 hover:text-black text-white transition-all inline-flex items-center justify-center whitespace-nowrap text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                    >
                      Attach 3D Image
                    </CldUploadButton>
                  ) : (
                    <p>{canvas.slice(0, 50)}...</p>
                  )}
                </div>
              </div>
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Holy Grail"
                          disabled={isPending}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="The Holy Grail is a powerful artifact"
                          disabled={isPending}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="startingPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="1000"
                          disabled={isPending}
                          type="number"
                          min={1}
                          max={1000000}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <Button disabled={isPending} type="submit" size="lg">
                Upload
              </Button>
            </form>
          </Form>
        </RoleGate>
      </CardContent>
    </Card>
  );
};

export default AdminUploadPage;
