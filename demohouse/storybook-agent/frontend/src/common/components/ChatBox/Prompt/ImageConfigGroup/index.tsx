/*
 * Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
 * Licensed under the 【火山方舟】原型应用软件自用许可协议
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at 
 *     https://www.volcengine.com/docs/82379/1433703
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React from "react";
import { Form, Radio, Input } from "@arco-design/web-react";
import {
  Resolution,
  Ratio,
  GenImageResolutionRatio2WHMap,
} from "../const";
import lockSvg from "@/storybook-web/styles/assets/lock.svg";
import { RatioThumb } from "./RatioThumb";

export interface ImageSizeValue {
  resolution: Resolution;
  ratio: Ratio;
}

/**
 * 渲染分辨率与图片比例选择表单，使用 Arco Radio(type="button")。
 * 受控组件：通过 value/onChange 与外部 Form 联动。
 */
/**
 * 表单：分辨率 + 比例 + 尺寸展示
 */
const ImageConfigGroup: React.FC<{
  value?: ImageSizeValue;
  onChange?: (val: ImageSizeValue) => void;
  lockRatio?: Ratio;
}> = ({ value, onChange, lockRatio }) => {
  const current: ImageSizeValue = {
    resolution: value?.resolution ?? Resolution.Resolution_2K,
    ratio: value?.ratio ?? Ratio.Ratio_9_16,
  };

  const resolutionOptions: Resolution[] = [
    Resolution.Resolution_2K,
    Resolution.Resolution_4K,
  ];

  const ratioOptions: Ratio[] = [
    Ratio.Ratio_1_1,
    Ratio.Ratio_3_4,
    Ratio.Ratio_4_3,
    Ratio.Ratio_16_9,
    Ratio.Ratio_9_16,
    Ratio.Ratio_2_3,
    Ratio.Ratio_3_2,
    Ratio.Ratio_21_9,
  ];

  const wh =
    GenImageResolutionRatio2WHMap[current.resolution]?.[current.ratio] ||
    undefined;

  const setResolution = (r: Resolution) => {
    onChange?.({ resolution: r, ratio: current.ratio });
  };

  const setRatio = (ra: Ratio) => {
    onChange?.({ resolution: current.resolution, ratio: ra });
  };

  return (
    <div className="w-full mb-6">
      <Form.Item className="w-full" field="resolution" label="分辨率" layout="vertical" initialValue={Resolution.Resolution_2K}>
        <Radio.Group type="button" className="flex" value={current.resolution} onChange={setResolution as any}>
            {resolutionOptions.map((r) => (
            <Radio className="flex-1 flex items-center justify-center h-[30px] [&.arco-radio-button]: !text-[#737373]" key={r} value={r}>
                {r}
            </Radio>
            ))}
        </Radio.Group>
      </Form.Item>
      <Form.Item className="w-full" field="ratio" label="图片比例" layout="vertical" initialValue={Ratio.Ratio_1_1}>
        <Radio.Group
          type="button"
          className="flex"
          value={lockRatio ?? current.ratio}
          disabled={Boolean(lockRatio)}
          onChange={setRatio as any}
        >
            {ratioOptions.map((ra) => (
            <Radio
                className="flex-1 flex items-center justify-center h-[60px] w-[20px] [&.arco-radio-button]: !text-[#737373]"
                key={ra}
                value={ra}
            >
                <div className="flex flex-col items-center gap-1">
                <RatioThumb ratio={ra} />
                <span className="text-xs">{ra}</span>
                </div>
            </Radio>
            ))}
        </Radio.Group>
      </Form.Item>
      <div className="mt-4 mb-2">图片尺寸</div>
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <Input
            disabled
            value={wh ? String(wh[0]) : ""}
            addBefore={<span className="px-2">W</span>}
          />
        </div>
        <img src={lockSvg} alt="lock" className="w-5 h-5 opacity-70" />
        <div className="flex-1">
          <Input
            disabled
            value={wh ? String(wh[1]) : ""}
            addBefore={<span className="px-2">H</span>}
          />
        </div>
      </div>
    </div>
  );
};

export default ImageConfigGroup;