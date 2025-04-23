import { OSType } from "@/services/sandbox";
import { FC } from "react";

export const OsTypeLogo: FC<{
  osType?: OSType;
  size?: "small" | "large";
}> = ({ osType, size = "small" }) => {
  if (size === "large") {
    if (osType === OSType.WINDOWS) {
      return (
        <img
          className="w-16 h-16"
          src="https://lf-iaas.volccdn.com/obj/bucket-iaas/toutiao/iaasng/cimages/1.0.0.92/os_platform/windows.png"
        />
      );
    } else if (osType === OSType.LINUX) {
      return (
        <img
          className="w-16 h-16"
          src="https://lf-iaas.volccdn.com/obj/bucket-iaas/toutiao/iaasng/cimages/1.0.0.92/os_platform/debian.png"
        />
      );
    } else {
      return null;
    }
  } else {
    if (osType === OSType.WINDOWS) {
      return (
        <img
          className="w-4 h-4"
          src="https://lf-iaas.volccdn.com/obj/bucket-iaas/toutiao/iaasng/cimages/1.0.0.92/os_platform/windows.png"
        />
      );
    } else if (osType === OSType.LINUX) {
      return (
        <img
          className="w-4 h-4"
          src="https://lf-iaas.volccdn.com/obj/bucket-iaas/toutiao/iaasng/cimages/1.0.0.92/os_platform/debian.png"
        />
      );
    } else {
      return null;
    }
  }
};
