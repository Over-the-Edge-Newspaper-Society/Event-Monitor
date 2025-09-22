import { AlertCircle, CheckCircle } from "lucide-react";
import { memo } from "react";

interface AlertBannerProps {
  message: string;
  variant: "error" | "success";
}

const AlertBannerComponent = ({ message, variant }: AlertBannerProps) => {
  const Icon = variant === "error" ? AlertCircle : CheckCircle;
  const styles =
    variant === "error"
      ? "bg-red-100 text-red-700"
      : "bg-green-100 text-green-700";

  return (
    <div className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm ${styles}`}>
      <Icon className="h-4 w-4" />
      <span>{message}</span>
    </div>
  );
};

export const AlertBanner = memo(AlertBannerComponent);
