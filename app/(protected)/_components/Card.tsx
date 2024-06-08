import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface CardWrapperProps {
  children?: React.ReactNode;
  headerLabel: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const CardWrapper = ({
  children,
  headerLabel,
  size = "lg",
  className,
}: CardWrapperProps) => {
  const sizeClasses = {
    sm: "w-[500px]",
    md: "w-[700px]",
    lg: "w-[900px]",
  };

  return (
    <Card className={`${sizeClasses[size]} ${className}`}>
      <CardHeader>
        <h1 className="text-center font-semibold italic text-5xl tracking-wider text-sky-400 mt-5">
          {headerLabel}
        </h1>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
};

export default CardWrapper;
