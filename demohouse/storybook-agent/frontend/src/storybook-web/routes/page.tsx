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

import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
} from "react";
import classNames from "classnames";
import { Layout } from "@arco-design/web-react";
import styles from "./page.module.less";
import Header from "@/common/components/ChatBox/Header";
import {
  MessageList,
  MessageCard,
  type Message,
} from "@/common/components/ChatBox/Message";
import Prompt, { PromptData } from "@/common/components/ChatBox/Prompt";
import { GenerateStoryBookResponse, generateStoryBook } from "../apis";
import {
  generateUniqueId,
  formatDate,
  getQueryValue,
  formatPromptData2Params,
  formatImageUrl,
  formatFileName,
  downloadImages,
} from "../utils";
import { Loading } from "@/common/components/ChatBox/Loading";
import { Error } from "@/common/components/ChatBox/Error";
import Comic, { getTemplateData } from "@/common/components/Comic";
import {
  IDataItem,
  VsStoryBookMessageCard,
} from "@/common/components/StoryBook";
import UserMessage from "@/storybook-web/components/UserMessage";
import { ImageViewModal } from "../components/ImageViewBox";
import { StoryPreviewBox } from "../components/StoryPreviewBox";
import { StoryPrintBox, StoryPrintBoxRef } from "../components/StoryBookPrint";
import { MODEL, MODEL_VERSION } from "../consts";
import { IconDownload, IconFullscreen } from "@arco-design/web-react/icon";
import { ReactComponent as SeedComicsIcon } from "./assets/comics.svg";

interface TempData {
  comicsImage?: string;
}

const Index = () => {
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const comicContainerRef = useRef<HTMLDivElement>(null);
  const storyPrintBoxRef = useRef<StoryPrintBoxRef>(null);
  const extraDataRef = useRef<TempData>({});

  const [comicsDetail, setComicsDetail] = useState<
    GenerateStoryBookResponse & { index: number; imageList: string[] }
  >();
  const [storybookDetail, setStorybookDetail] =
    useState<GenerateStoryBookResponse>();
  const storyDataList = useMemo(
    () =>
      (storybookDetail?.Items?.map((item, index) => {
        return {
          id: index,
          isCover: item.IsCover || index === 0,
          title: storybookDetail.Title || "",
          url: item?.Url || "",
          text: item?.Text || "",
          showTitle: item.IsCover,
          pageNumber: index + 1,
          pageTotal: storybookDetail?.Items?.length || 0,
        };
      }) as unknown as IDataItem[]) || [],
    [storybookDetail]
  );

  const [formData, setFormData] = useState<PromptData>();
  const [messages, setMessages] = useState<Message[]>([]);
  const isListEmpty = useMemo(() => messages.length === 0, [messages]);

  const addMessage = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const replaceMessage = useCallback((id: string, message: Message) => {
    setMessages((prev) =>
      prev.map((item) => (item.id === id ? message : item))
    );
  }, []);

  const handleEditClick = useCallback((message: Message) => {
    setFormData(message.data?.params);
  }, []);

  const renderMessageItem = useCallback((message: Message) => {
    if (message.type === "user") {
      const data: PromptData = message.data;
      return <UserMessage message={message} />;
    }

    if (message.type === "assistant") {
      const data: GenerateStoryBookResponse = message.data;
      const templateData = getTemplateData("square", data.Items?.length)[0];
      switch (message.status) {
        case "loading":
          return (
            <Loading
              className="mb-9 max-w-[600px]"
              text={
                message.data?.params?.mode === "storybook"
                  ? "故事书生成中"
                  : "连环画生成中"
              }
            />
          );
        case "success":
          if (data.Mode === "storybook") {
            return (
              <MessageCard
                className="max-w-[600px]"
                onEditClick={() => handleEditClick(message)}
              >
                <VsStoryBookMessageCard
                  cover={data.Items?.[0]?.Url}
                  title={data.Title}
                  content={data.Summary}
                  description={`创建时间：${formatDate(
                    message.timestamp,
                    "HH:mm"
                  )}`}
                  viewText="查看"
                  onViewClick={() => {
                    setStorybookDetail(data);
                  }}
                ></VsStoryBookMessageCard>
              </MessageCard>
            );
          }
          if (data.Mode === "comics") {
            return (
              <MessageCard
                className="max-w-[600px] cursor-pointer"
                areaLeftTop={
                  <div className="flex flew-nowrap">
                    <div className="px-2 py-1 text-sm text-white bg-[#5d5d5d99] rounded">
                      {MODEL}
                    </div>
                    <div className="ml-2 px-2 py-1 text-sm text-white bg-[#5d5d5d99] rounded">
                      <SeedComicsIcon className="mr-1 relative top-[2px] w-[14px]"></SeedComicsIcon>
                      连环画模式
                    </div>
                  </div>
                }
                areaRightSide={
                  <div className="flex flex-col items-center cursor-pointer">
                    <div className="flex items-center justify-center w-[30px] h-[30px] rounded bg-[#5d5d5d99] hover:bg-[#5d5d5d52]">
                      <IconFullscreen
                        fontSize={20}
                        style={{ color: "white" }}
                        onClick={() => {
                          if (extraDataRef.current.comicsImage) {
                            setComicsDetail({
                              index: 0,
                              imageList: [
                                extraDataRef.current.comicsImage,
                                ...data?.Items?.map((i) =>
                                  formatImageUrl(i?.Url || "")
                                ),
                              ],
                              ...data,
                            });
                          }
                        }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-center w-[30px] h-[30px] rounded bg-[#5d5d5d99] hover:bg-[#5d5d5d52]">
                      <IconDownload
                        fontSize={20}
                        style={{ color: "white" }}
                        onClick={() => {
                          extraDataRef.current.comicsImage &&
                            downloadImages(
                              [
                                extraDataRef.current.comicsImage,
                                ...data?.Items?.map(
                                  (i) =>
                                    location.origin +
                                    formatImageUrl(i?.Url || "")
                                ),
                              ],
                              (index) => `${formatFileName(MODEL)}-${index}`,
                              formatFileName(MODEL)
                            );
                        }}
                      />
                    </div>
                  </div>
                }
                onEditClick={() => handleEditClick(message)}
              >
                <div
                  className="aspect-video w-full flex items-center justify-center overflow-hidden bg-[#2B303A] rounded-[12px]"
                  ref={comicContainerRef}
                >
                  <Comic
                    style={{ background: "#2B303A" }}
                    width={templateData.width}
                    height={templateData.height}
                    template={templateData}
                    onClick={(index) => {
                      if (extraDataRef.current.comicsImage) {
                        setComicsDetail({
                          index: index + 1,
                          imageList: [
                            extraDataRef.current.comicsImage,
                            ...data?.Items?.map((i) =>
                              formatImageUrl(i?.Url || "")
                            ),
                          ],
                          ...data,
                        });
                      }
                    }}
                    onLoaded={(dataURL) => {
                      extraDataRef.current.comicsImage = dataURL;
                    }}
                    images={
                      data.Items?.map((i) => formatImageUrl(i?.Url || "")) || []
                    }
                    getContainer={() => comicContainerRef.current}
                  />
                </div>
              </MessageCard>
            );
          }
          return null;
        case "error":
          return <Error className="mb-9 max-w-[600px]"></Error>;
        default:
          return null;
      }
    }
  }, []);

  const handleSend = async (formData: PromptData) => {
    const reqId = generateUniqueId();
    const resId = generateUniqueId();
    const data = formatPromptData2Params(formData);

    addMessage({
      id: reqId,
      type: "user",
      data: { ...data },
      timestamp: Date.now(),
    });

    const messageData: Message = {
      id: resId,
      parentId: reqId,
      type: "assistant",
      status: "loading",
      data: { params: formData },
      timestamp: Date.now(),
    };

    addMessage(messageData);

    try {
      const result = await generateStoryBook(data);
      replaceMessage(resId, {
        ...messageData,
        status: "success",
        data: { ...result, params: formData },
      });
    } catch (e) {
      replaceMessage(resId, { ...messageData, status: "error" });
    }
  };

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <>
      <Layout className="h-full bg-[#fafbfd]">
        <Layout.Header>
          <Header title={MODEL} subtitle={MODEL_VERSION} />
        </Layout.Header>

        <Layout className="h-full overflow-hidden" hasSider>
          <Layout.Content
            className={classNames(
              "h-full overflow-auto",
              styles.contentScrollbar
            )}
            ref={chatContainerRef}
          >
            <div
              className={classNames(
                "px-8",
                isListEmpty ? "h-[50%]" : "pb-[220px]"
              )}
            >
              <MessageList messages={messages}>{renderMessageItem}</MessageList>
            </div>

            <div
              className={classNames(
                "fixed min-w-[500px] bottom-10 left-0 px-8 z-100 transition-all duration-400 ease-in-out",
                {
                  "right-[50%]": Boolean(storybookDetail),
                  "right-0": !Boolean(storybookDetail),
                  "top-[50%]": isListEmpty,
                }
              )}
            >
              <Prompt data={formData} onSubmit={handleSend}></Prompt>
            </div>
          </Layout.Content>

          <Layout.Sider
            width="50%"
            style={{
              transition: "width 0.3s cubic-bezier(0.34, 0.69, 0.1, 1)",
              backgroundColor: "#fafbfd",
              borderLeft: "none",
              boxShadow: "none",
            }}
            collapsed={!Boolean(storybookDetail)}
            collapsedWidth={0}
          >
            {storyDataList ? (
              <StoryPreviewBox
                pages={storyDataList}
                title={storybookDetail?.Title || ""}
                onClose={() => {
                  setStorybookDetail(undefined);
                }}
                onDownload={() => {
                  storyPrintBoxRef.current?.reactToPrintFn?.();
                }}
              />
            ) : null}
          </Layout.Sider>
        </Layout>
      </Layout>

      {/* 连环画图片查看器 */}
      <ImageViewModal
        visible={!!comicsDetail}
        imageList={comicsDetail?.imageList || []}
        initialIndex={comicsDetail?.index}
        onClose={() => {
          setComicsDetail(undefined);
        }}
      ></ImageViewModal>

      {/* 故事书打印 */}
      {storyDataList.length ? (
        <StoryPrintBox
          ref={storyPrintBoxRef}
          list={storyDataList}
          filename={storybookDetail?.Title || ""}
        ></StoryPrintBox>
      ) : null}

      {/* Prompt输入框 已移动至 Layout.Content 内 */}
    </>
  );
};

export default Index;
