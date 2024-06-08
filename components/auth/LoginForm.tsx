"use client";

import { CardWrapper } from "@/components/auth/CardWrapper";

export const LoginForm = () => {
  //   const urlError =
  //     searchParams.get("error") === "OAuthAccountNotLinked"
  //       ? "Email already in use with different provider!"
  //       : "";

  return (
    <CardWrapper
      headerLabel="Welcome back"
      showSocial
      backButtonHref="/"
      backButtonLabel="Back to Home Page"
    >
    </CardWrapper>
  );
};
