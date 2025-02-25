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

import { CONST } from './constants';
import { IClientRequestData } from './types';

function convertBlobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as ArrayBuffer);
    };
    reader.readAsArrayBuffer(blob);
  });
}

const generateHeader = (
  message_type = CONST.CLIENT_FULL_REQUEST,
  version = CONST.PROTOCOL_VERSION,
  message_type_specific_flags = CONST.NO_SEQUENCE,
  serial_method = CONST.JSON,
  compression_type = CONST.NO_COMPRESSION,
  reserved_data = 0x00,
  extension_header = new ArrayBuffer(0),
) => {
  const buffer = new ArrayBuffer(8);
  const dataView = new DataView(buffer);

  const header_size = Math.trunc(extension_header.byteLength / 4) + 1;
  dataView.setUint8(0, (version << 4) | header_size);
  dataView.setUint8(1, (message_type << 4) | message_type_specific_flags);
  dataView.setUint8(2, (serial_method << 4) | compression_type);
  dataView.setUint8(3, reserved_data);
  return dataView;
};

export const parseResponse = async (res: Blob) => {
  const arraybuffer = await convertBlobToArrayBuffer(res);
  const dataView = new DataView(arraybuffer);
  const header_size = dataView.getUint8(0) & 15;
  const message_type = dataView.getUint8(1) >> 4;
  const message_type_specific_flags = dataView.getUint8(1) & 15;
  const message_description_length = message_type === CONST.SERVER_ERROR_RESPONSE ? 8 : 4;
  const sequence = message_type_specific_flags & 1 ? 4 : 0;
  const payloadBuffer = arraybuffer.slice(header_size * 4 + sequence + message_description_length);
  const uint8_msg = new Uint8Array(payloadBuffer);
  const enc = new TextDecoder('utf-8');
  const text = enc.decode(uint8_msg);
  const payload = JSON.parse(text);
  return payload;
};

export const encodeFullClientRequest = (requestData: IClientRequestData) => {
  const full_client_request_header = generateHeader();
  const json = JSON.stringify(requestData);
  full_client_request_header.setUint32(4, json.length, false);

  return new Blob([full_client_request_header, json]);
};

export const encodeAudioOnlyRequest = (requestData: Blob) => {
  const audio_only_request_header = generateHeader(CONST.CLIENT_AUDIO_ONLY_REQUEST);
  audio_only_request_header.setUint32(4, requestData.size, false);
  return new Blob([audio_only_request_header, requestData]);
};
