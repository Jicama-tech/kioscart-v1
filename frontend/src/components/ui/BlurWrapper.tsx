import { ReactNode } from "react";

interface BlurWrapperProps {
  children: ReactNode;
}

export function BlurWrapper({ children }: BlurWrapperProps) {
  return <>{children}</>;
}
