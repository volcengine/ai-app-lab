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

import React, { useEffect } from "react";
import classNames from "classnames";
import {
  Form,
  Upload,
  Input,
  Button,
  Select,
  Popover,
} from "@arco-design/web-react";
import { fileToBase64 } from "./utils";
import {
  SupportImageFileTypes,
  Resolution,
  Ratio,
  GenImageResolutionRatio2WHMap,
} from "./const";
import ImageConfigGroup from "./ImageConfigGroup";
import styles from "./index.module.less";
import { RatioThumb } from "./ImageConfigGroup/RatioThumb";

export interface PromptData {
  images?: string[];
  text?: string;
  mode?: "storybook" | "comics";
  ratio?: string;
  resolution?: string;
  size?: string;
}

export interface PromptProps {
  data?: PromptData;
  onSubmit?: (value: PromptData) => void;
}

const modes = [
  {
    key: "storybook",
    label: "故事书",
    description: "根据指定内容创建专属绘本",
  },
  {
    key: "comics",
    label: "连环画",
    description: "一句话生成动漫、连环画",
  },
] as const;

const Prompt: React.FC<PromptProps> = ({ data, onSubmit }) => {
  const [form] = Form.useForm<PromptData>();
  const ratioValue = Form.useWatch("ratio", form as any) as Ratio;
  const resolutionValue = Form.useWatch(
    "resolution",
    form as any
  ) as Resolution;
  const modeValue = Form.useWatch("mode", form as any) as
    | "storybook"
    | "comics";
  const textValue = Form.useWatch("text", form as any) as string;
  const imagesValue = Form.useWatch("images", form as any);

  const handleSubmit = () => {
    const result = form.getFieldsValue();
    form.setFieldValue("text", "");
    form.setFieldValue("images", []);
    onSubmit?.(result);
  };

  useEffect(() => {
    const sizeArray =
      GenImageResolutionRatio2WHMap[resolutionValue]?.[ratioValue] || "";
    form.setFieldValue("size", sizeArray.toString());
  }, [ratioValue, resolutionValue]);

  useEffect(() => {
    if (modeValue === "storybook") {
      form.setFieldValue("ratio", Ratio.Ratio_9_16);
      const sizeArray =
        GenImageResolutionRatio2WHMap[resolutionValue]?.[Ratio.Ratio_9_16] ||
        "";
      form.setFieldValue("size", sizeArray.toString());
    }
  }, [modeValue]);

  useEffect(() => {
    data && form.setFieldsValue(data || {});
  }, [data]);

  return (
    <Form
      form={form}
      className={classNames(
        "m-auto pt-4 px-4 pb-2 max-w-[940px] rounded-[12px] border b-solid bg-white",
        styles.sender
      )}
      onSubmit={handleSubmit}
    >
      <div
        className={classNames(
          "flex flex-row",
          imagesValue?.length && "!flex-col"
        )}
      >
        <Form.Item
          className={classNames(
            "flex-none w-[90px] pl-2",
            imagesValue?.length && "!w-full mb-2"
          )}
          field="images"
          triggerPropName="fileList"
        >
          <Upload
            listType="picture-card"
            imagePreview
            multiple
            limit={10}
            accept={{
              type: SupportImageFileTypes.map((t) => `.${t}`).join(","),
              strict: false,
            }}
            onChange={() => {}}
            customRequest={async ({ file, onSuccess, onError }) => {
              try {
                onSuccess({
                  url: URL.createObjectURL(file),
                  base64: await fileToBase64(file),
                  name: file.name,
                });
              } catch (e: any) {
                onError(e);
              }
            }}
          />
        </Form.Item>

        <Form.Item className="[&_div]:basis-full" field="text">
          <Input.TextArea
            className="text-sm !border-[0px] focus:shadow-none text-[black] resize-none"
            autoSize={{ minRows: 2, maxRows: 5 }}
            placeholder="结合图片，输入创意描述"
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
        </Form.Item>
      </div>

      <div className="flex justify-between">
        <div className="flex w-50%">
          <Form.Item
            className="ml-2 mb-2"
            field="mode"
            initialValue={"storybook"}
          >
            <Select
              placeholder="请选择"
              allowClear={false}
              style={{ width: 100 }}
              triggerProps={{
                autoAlignPopupWidth: false,
                position: "bl",
              }}
              renderFormat={(_, value) => {
                const option = modes.find((o) => o.key === value);
                return (option?.label || value) as string;
              }}
            >
              {modes.map((option) => (
                <Select.Option value={option.key} key={option.key}>
                  <div>
                    <div className="text-[13px]">{option.label}</div>
                    <div className="text-[12px] text-[#666] leading-[24px] mt-[-2px]">
                      {option.description}
                    </div>
                  </div>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Popover
            trigger="click"
            className="min-w-[410px]"
            content={
              <ImageConfigGroup
                value={{
                  resolution: resolutionValue,
                  ratio:
                    modeValue === "storybook" ? Ratio.Ratio_9_16 : ratioValue,
                }}
                lockRatio={
                  modeValue === "storybook" ? Ratio.Ratio_9_16 : undefined
                }
                onChange={(val) => {
                  form.setFieldValue("resolution", val.resolution);
                  form.setFieldValue("ratio", val.ratio);
                  const sizeArray =
                    GenImageResolutionRatio2WHMap[val.resolution]?.[
                      val.ratio
                    ] || "";
                  form.setFieldValue("size", sizeArray.toString());
                }}
              />
            }
          >
            <div className="flex flex-row ml-2 mb-2 flex-nowrap flex-none items-center justify-center px-3 h-[32px]  border border-solid border-[var(--color-border-3)] cursor-pointer rounded-[6px]">
              <div className="pr-2 mr-2 border-[0px] !border-r-[1px] border-solid border-[var(--color-border-3)]">
                {resolutionValue || Resolution.Resolution_2K}
              </div>
              <div className="flex items-center gap-1">
                <RatioThumb
                  ratio={
                    modeValue === "storybook"
                      ? Ratio.Ratio_9_16
                      : (ratioValue as Ratio) || Ratio.Ratio_1_1
                  }
                />
                <span className="inline-block w-[24px] text-center">
                  {modeValue === "storybook"
                    ? Ratio.Ratio_9_16
                    : ratioValue || Ratio.Ratio_1_1}
                </span>
              </div>
            </div>
          </Popover>
          <Form.Item field="ratio" initialValue={Ratio.Ratio_1_1} noStyle>
            <div></div>
          </Form.Item>
          <Form.Item
            field="resolution"
            initialValue={Resolution.Resolution_2K}
            noStyle
          >
            <div></div>
          </Form.Item>
          <Form.Item field="size" noStyle>
            <div></div>
          </Form.Item>
        </div>

        <div className="w-50%">
          <Form.Item className="mb-2">
            <Button
              type="primary"
              className="ml-2"
              htmlType="submit"
              disabled={!textValue}
            >
              发送
            </Button>
          </Form.Item>
        </div>
      </div>
    </Form>
  );
};

export default Prompt;
