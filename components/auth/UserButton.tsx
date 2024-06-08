"use client";

import { FaUser } from "react-icons/fa";
import { MdFileUpload } from "react-icons/md";
import { FaGear } from "react-icons/fa6";
import { ImExit } from "react-icons/im";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { UserRole } from "@prisma/client";
import Link from "next/link";

export const UserButton = () => {
  const { user, role } = useCurrentUser();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Avatar>
          <AvatarImage src={user?.image || ""} />
          <AvatarFallback className="bg-sky-500">
            <FaUser className="text-white" />
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-40" align="end">
        <DropdownMenuLabel>My Account</DropdownMenuLabel>
        <DropdownMenuGroup>
          <Link href="/profile">
            <DropdownMenuItem>
              <FaUser className="h-4 w-4 mr-2" />
              Profile
            </DropdownMenuItem>
          </Link>
          <Link href="/settings">
            <DropdownMenuItem>
              <FaGear className="h-4 w-4 mr-2" />
              Settings
            </DropdownMenuItem>
          </Link>
        </DropdownMenuGroup>
        {role === UserRole.ADMIN && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Admin</DropdownMenuLabel>
            <DropdownMenuGroup>
              <Link href="/admin/upload">
                <DropdownMenuItem>
                  <MdFileUpload className="h-4 w-4 mr-2" />
                  Upload
                </DropdownMenuItem>
              </Link>
            </DropdownMenuGroup>
          </>
        )}
        <DropdownMenuSeparator />
        <LogoutButton>
          <DropdownMenuItem>
            <ImExit className="h-4 w-4 mr-2" />
            Logout
          </DropdownMenuItem>
        </LogoutButton>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
