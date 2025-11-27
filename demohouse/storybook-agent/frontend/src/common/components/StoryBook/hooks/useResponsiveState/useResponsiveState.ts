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

import { useEffect, useMemo, useState } from 'react'
import { useCreation } from 'ahooks'

import ResponsiveObserver from './responsiveObserver' // ScreenMap, // responsiveArray,
import { type Options, type MatchMediaList, type MatchMediaListSimple, strategyEnum } from './interface'

function useResponsiveState<T>(
  mediaQueryList: MatchMediaList<T>[] | MatchMediaListSimple<T>[],
  options: Options<T>,
): T | undefined {
  // 格式化输入数据
  const composeData = useMemo(() => {
    return mediaQueryList.map((v) => {
      if ('matchMedia' in v) {
        return v
      } else {
        const min = typeof v.min === 'number' ? `${v.min}px` : v.min
        const max = typeof v.max === 'number' ? `${v.max}px` : v.max
        const matchMedia = [min ? `(min-width: ${min})` : '', max ? `(max-width: ${max})` : ''].filter((v) =>
          Boolean(v),
        )
        return {
          ...v,
          matchMedia: matchMedia.join(' and '),
        }
      }
    })
  }, [mediaQueryList])
  const responsiveObserveData = useMemo(() => {
    if (options.strategy === strategyEnum.matchFirst) {
      const length = composeData.length
      return composeData.map((item, index) => {
        return {
          ...item,
          weight: length - index,
        }
      })
    } else {
      return composeData.map((item, index) => {
        return {
          ...item,
          weight: index + 1,
        }
      })
    }
  }, [composeData, options.strategy])

  // 订阅媒体查询
  const responsiveObserve = useCreation(() => new ResponsiveObserver(responsiveObserveData), [responsiveObserveData])

  // 接收当前满足媒体查询回调，用于甄别当前媒体查询下哪些符合条件
  const [screens, setScreens] = useState<{ [key: string]: boolean }>()
  useEffect(() => {
    const token = responsiveObserve.subscribe((screens) => {
      setScreens(screens)
    })

    return () => {
      token && responsiveObserve.unsubscribe(token)
    }
  }, [])

  // 返回当前媒体查询下满足条件的value，不满足则返回默认值
  return useMemo(() => {
    const screenList = responsiveObserveData
      .filter((item) => {
        return screens?.[item.matchMedia]
      })
      .sort((a, b) => b.weight - a.weight)
    const selectedValue = screenList.length > 0 ? screenList[0].value : options.defaultValue
    return selectedValue
  }, [screens])
}
export default useResponsiveState
