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

let ffmpeg = null
let ffmpegLoaded = false
let ffmpegLoading = false

export const loadFFmpeg = async () => {
  if (ffmpegLoaded) return ffmpeg
  
  if (ffmpegLoading) {
    return new Promise((resolve) => {
      const checkLoaded = setInterval(() => {
        if (ffmpegLoaded) {
          clearInterval(checkLoaded)
          resolve(ffmpeg)
        }
      }, 100)
    })
  }
  
  ffmpegLoading = true
  
  try {
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/@ffmpeg/ffmpeg@0.10.1/dist/ffmpeg.min.js'
    document.head.appendChild(script)
    
    await new Promise((resolve) => {
      script.onload = resolve
    })
    
    ffmpeg = FFmpeg.createFFmpeg({ 
      log: true,
      progress: ({ ratio }) => {
        // 进度回调
      }
    })
    
    await ffmpeg.load()
    ffmpegLoaded = true
    return ffmpeg
    
  } catch (error) {
    console.error('FFmpeg 加载错误:', error)
    throw error
  } finally {
    ffmpegLoading = false
  }
}

export const extractAudio = async (videoData) => {
  try {
    ffmpeg.FS('writeFile', 'input_video.mp4', videoData)
    await ffmpeg.run('-i', 'input_video.mp4', '-q:a', '0', '-map', 'a', 'output_audio.mp3')
    return ffmpeg.FS('readFile', 'output_audio.mp3')
  } catch (error) {
    console.error('音频提取失败:', error)
    throw error
  }
}
