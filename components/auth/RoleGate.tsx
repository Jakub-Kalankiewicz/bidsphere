"use client";

import { UserRole } from "@prisma/client";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { FormError } from "@/components/FormError";

interface RoleGateProps {
  children: React.ReactNode;
  allowedRole: UserRole;
}

export const RoleGate = ({ children, allowedRole }: RoleGateProps) => {
  const { role } = useCurrentUser();

  if (role !== allowedRole) {
    return (
      <FormError message="You do not have permission to view this content!" />
    );
  }

  return <>{children}</>;
};
