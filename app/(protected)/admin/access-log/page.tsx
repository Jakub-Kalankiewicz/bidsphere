"use client";

import { useEffect, useState } from "react";
import { RoleGate } from "@/components/auth/RoleGate";
import { UserRole } from "@prisma/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ClipLoader } from "react-spinners";
import { toast } from "sonner";
import { getAccessLog, type AccessLogEntry } from "@/actions/getAccessLog";

const AccessLogPage = () => {
  const [entries, setEntries] = useState<AccessLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAccessLog().then((result) => {
      setLoading(false);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setEntries(result);
    });
  }, []);

  return (
    <RoleGate allowedRole={UserRole.ADMIN}>
      <Card className="w-[900px] mt-[100px] mb-8 max-h-[calc(100vh-160px)] flex flex-col">
        <CardHeader className="shrink-0">
          <p className="text-2xl font-semibold text-center">Access Log</p>
          <p className="text-sm text-muted-foreground text-center">
            Audit trail of all 3D model accesses
          </p>
        </CardHeader>
        <CardContent className="overflow-y-auto flex-1 min-h-0">
          {loading ? (
            <div className="flex justify-center py-10">
              <ClipLoader color="#36d7b7" size={50} />
            </div>
          ) : entries.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">
              No accesses recorded yet.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left pb-2 font-medium">Model</th>
                  <th className="text-left pb-2 font-medium">User</th>
                  <th className="text-left pb-2 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b last:border-0">
                    <td className="py-2 font-medium">{entry.itemName}</td>
                    <td className="py-2 text-muted-foreground">
                      {entry.userEmail ?? entry.userId}
                    </td>
                    <td className="py-2 text-muted-foreground font-mono text-xs">
                      {new Date(entry.accessedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </RoleGate>
  );
};

export default AccessLogPage;
