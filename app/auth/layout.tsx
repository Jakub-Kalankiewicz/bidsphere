const AuthLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="h-full w-full flex items-center justify-center gradient-background relative z-0">
      <div className="absolute h-full inset-0 bg-[url('../public/images/background.png')] bg-cover opacity-40 z-[-1]" />
      {children}
    </div>
  );
};

export default AuthLayout;
