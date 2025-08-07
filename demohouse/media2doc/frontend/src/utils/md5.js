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

import SparkMD5 from 'spark-md5'

/**
 * 计算文件或 ArrayBuffer 的 MD5 值
 * @param {File|ArrayBuffer|Uint8Array} file - 要计算 MD5 的文件或数据
 * @returns {Promise<string>} MD5 哈希值
 */
export const calculateMD5 = async (file) => {
  return new Promise((resolve, reject) => {
    try {
      const blobSlice = File.prototype.slice || File.prototype.mozSlice || File.prototype.webkitSlice
      const spark = new SparkMD5.ArrayBuffer()
      
      // 如果输入是 ArrayBuffer 或 Uint8Array
      if (file instanceof ArrayBuffer || file instanceof Uint8Array) {
        const buffer = file instanceof Uint8Array ? file.buffer : file
        spark.append(buffer)
        resolve(spark.end())
        return
      }
      
      // 如果输入是 File 或 Blob
      const fileReader = new FileReader()
      const chunkSize = 2097152 // 读取 2MB 块
      const chunks = Math.ceil(file.size / chunkSize)
      let currentChunk = 0
      
      fileReader.onload = (e) => {
        spark.append(e.target.result)
        currentChunk++
        
        if (currentChunk < chunks) {
          loadNext()
        } else {
          const md5Hash = spark.end()
          resolve(md5Hash)
        }
      }
      
      fileReader.onerror = (error) => {
        reject(error)
      }
      
      const loadNext = () => {
        const start = currentChunk * chunkSize
        const end = Math.min(start + chunkSize, file.size)
        fileReader.readAsArrayBuffer(blobSlice.call(file, start, end))
      }
      
      loadNext()
    } catch (error) {
      reject(error)
    }
  })
}

export default {
  calculateMD5
}
