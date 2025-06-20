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

import { FC, useContext, useEffect, useMemo, useState } from 'react';

import { Button, Message, Modal, Upload } from '@arco-design/web-react';
import { useRequest } from 'ahooks';
import { debounce, isArray, isError } from 'lodash';
import { UploadTosContext } from '../../../store/UploadTos/context';
import { upsertImageRequest } from '@/types/upsertImage';
import { ERequestType, queryRequest } from '@/api';
import { IconUpload } from '@/images';
import { globalEnv } from '@/constant';
import { parseTosPath } from '@/utils/parseTosPath';
const TOS_PREFIX="user"
export const UploadTosFile: FC<{ refreshImage: () => void }> = ({ refreshImage }) => {
  const { uploadTos } = useContext(UploadTosContext);
  const [uploadNum, setUploadNum] = useState(0);
  const [fileNum, setFileNum] = useState(0);
  const [failFileList, setFailFileList] = useState<string[]>([]);
  const [successFileList, setSuccessFileList] = useState<string[]>([]);

  const { loading: upsertLoading, runAsync } = useRequest(
    async (fileList: string[]) => {
      try {
        await queryRequest<upsertImageRequest, any>(ERequestType.UPSERT_IMAGE, {
          data: {
            image_tos_path_list: fileList.map(file=> `tos://${globalEnv.BUCKET_NAME}/${TOS_PREFIX}/${file}`),
            upload_time: Date.now(),
            user_id:globalEnv.ARK_DEFAULT_USER_ID,
            image_sign_list:[]
          },
        });
        return
      } catch (e: any) {
        //  插入失败的文件
        if (isError(e)) {
          const res = JSON.parse(e.message);
          if (res?.code) {
            if (res.code === 'upsert image failed' && res.message) {
              const arr:string[] = JSON.parse(res.message);
              if (isArray(arr)) {
                setFailFileList(list=>[...list,...arr.map((item:string)=>parseTosPath(item).fileName)]);
              }
            } else if (res.code === 'user already upload max count images') {
              Message.error('超过上传数量限制，最多上传100张图片');
            }
          }
        }
        throw new Error(e);
      }
    },
    {
      manual: true,
    },
  );
  const debounceRefresh = debounce(() => {
    refreshImage();
  }, 20 * 1000);

  // 图片上传
  const handleUpload = async (file: File, files: File[]) => {
    // 设置上传图片数量
    setFileNum(files.length);
    // 保存上传成功和失败的文件
    try {
      if (file.size > 10 * 1024 * 1024) {
        throw new Error('图片大小不能超过10M');
      }
      await uploadTos(file,`${TOS_PREFIX}/${file.name}`);
      setSuccessFileList(fileList => [...fileList,file.name]);
    } catch {
      setFailFileList(list => [...list, file.name]);
    } finally {
      setUploadNum(uploadNum => uploadNum + 1);
    }
  };
  // 是否完成上传
  const finishUpload = useMemo(() => fileNum === uploadNum, [fileNum, uploadNum]);

  // 上传完插入图片
  const handleUpsert = async () => {
    try {
       successFileList.length&&await runAsync(successFileList);
      if (failFileList.length) {
        Message.error(`${failFileList.join(',')}上传失败, 请更换图片重新试试吧`);
        return
      }
      Modal.success({
        title: '图片上传成功',
        content:
          '索引更新需要一段时间，更新后系统会自动刷新您的图库。此外，上传图片有效期为30天，30天后系统会自动删除图库内手动上传的图片',
        okText: '我知道了',
        cancelText: '取消',
      });
      // 刷新图库
      debounceRefresh();
    } catch (e: any) {
      console.error(e);
    } finally {
      // 重置上传进度
      setFileNum(0);
      setUploadNum(0);
      setSuccessFileList([]);
      setFailFileList([]);
    }
  };
  useEffect(() => {
    if (finishUpload && fileNum) {
      handleUpsert();
    }
  }, [finishUpload, fileNum]);

  // 是否能上传
  const activeSend = useMemo(() => finishUpload && !upsertLoading, [finishUpload, upsertLoading]);

  return (
    <div>
      <Upload
        limit={10}
        multiple
        accept="image/png,image/jpg,image/jpeg"
        beforeUpload={async (file, files) => {
          handleUpload(file, files);
          return false;
        }}
        showUploadList={false}
        disabled={!activeSend}
        onExceedLimit={() => {
          Message.warning('超过上传数量限制，单次最多上传10张图片');
        }}
      >
        <div className="w-[261px] h-[40px] p-[2px] rounded-full bg-gradient-to-r from-[#3B91FF] via-[#0D5EFF] to-[#C069FF]">
          <Button
            disabled={!activeSend}
            icon={<IconUpload />}
            className="w-full h-full !bg-white rounded-full flex items-center font-medium text-[13px] justify-center hover:!border-white"
          >
            {activeSend ? '上传图片' : `上传图片中 ${Math.floor((successFileList.length / (fileNum + 2)) * 100)}% ...`}
          </Button>
        </div>
      </Upload>
    </div>
  );
};
