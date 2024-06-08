'use client'

import { UserInfo } from "@/components/UserInfo";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import React from "react";

const ProfilePage = () => {
  const { user } = useCurrentUser();
  return <UserInfo user={user} label="Profile" />;
};

export default ProfilePage;
