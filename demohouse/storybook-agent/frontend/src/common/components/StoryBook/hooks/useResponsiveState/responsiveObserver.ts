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

import { MediaQueryList } from './interface'
type SubscribeFunc = <T>(screens: { [media: string]: boolean }, breakpointChecked: string | null) => void

class ResponsiveObserver {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  public matchHandlers: Record<string, any> = {} as Record<string, any>

  public responsiveMap: MediaQueryList[]

  public subscribers: Array<{
    token: string
    func: SubscribeFunc
  }> = []

  public subUid = -1

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  private screens = {} as { [media: string]: boolean }

  public constructor(params: MediaQueryList[]) {
    this.responsiveMap = params
  }

  public dispatch(pointMap: { [media: string]: boolean }, breakpointChecked: string) {
    this.screens = pointMap
    if (this.subscribers.length < 1) {
      return false
    }

    this.subscribers.forEach((item) => {
      item.func(this.screens, breakpointChecked)
    })

    return true
  }

  public subscribe(func: SubscribeFunc) {
    if (this.subscribers.length === 0) {
      this.register()
    }
    const token = (++this.subUid).toString()
    this.subscribers.push({
      token,
      func,
    })
    func(this.screens, null)
    return token
  }

  public unsubscribe(token: string) {
    this.subscribers = this.subscribers.filter((item) => item.token !== token)
    if (this.subscribers.length === 0) {
      this.unregister()
    }
  }

  public unregister() {
    this.responsiveMap.forEach((matchMediaQuery) => {
      const handler = this.matchHandlers[matchMediaQuery.matchMedia]
      if (handler?.mql && handler.listener) {
        try {
          // 兼容iPad
          if ('removeEventListener' in handler.mql) {
            handler.mql.removeEventListener('change', handler.listener)
          } else if ('removeListener' in handler.mql) {
            ;(handler.mql as any).removeListener(handler.listener)
          }
        } catch (error) {}
      }
    })
  }

  public register() {
    this.responsiveMap.forEach((matchMediaQuery) => {
      const listener = ({ matches }: { matches: boolean }) => {
        this.dispatch(
          {
            ...this.screens,
            [matchMediaQuery.matchMedia]: matches,
          } as any,
          matchMediaQuery.matchMedia,
        )
      }
      const mql = window.matchMedia(matchMediaQuery.matchMedia)
      try {
        // 兼容iPad
        if ('addEventListener' in mql) {
          mql.addEventListener('change', listener)
        } else if ('addListener' in mql) {
          ;(mql as any).addListener(listener)
        } else if ('onchange' in mql) {
          ;(mql as any).onchange = (e: any) => {
            listener(e)
          }
        }
      } catch (error) {}
      this.matchHandlers[matchMediaQuery.matchMedia] = {
        mql,
        listener,
      }
      listener(mql)
    })
  }
}

export default ResponsiveObserver
