// Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
// Licensed under the 【火山方舟】原型应用软件自用许可协议
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at 
//     https://www.volcengine.com/docs/82379/1433703
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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
