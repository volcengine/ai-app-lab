# Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
# Licensed under the 【火山方舟】原型应用软件自用许可协议
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#     https://www.volcengine.com/docs/82379/1433703
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.


import time


def get_today():
    current_time = time.localtime()
    formatted_date = time.strftime("%Y-%m-%d", current_time)

    return formatted_date


class TimeIt(object):
    """ 程序运行的消耗时间统计。

    Args:
        name(str): 指定代码段的功能含义，可不指定
        unit(str): 计时单位，包括 秒(s)与毫秒(ms)
        no_print(bool): 指定是否打印计时

    Examples:
        >>> import jionlp as jio
        >>> with jio.TimeIt('test func1') as ti:
        >>>     func1()
        >>>     cost_time = ti.break_point(restart=True)
        >>> print(cost_time)

    """
    def __init__(self, name=None, unit='s', no_print=False):
        self.start_time = None
        self.restart_time = None  # 每次执行断点的重新计数时间
        self.cost_time = None
        self.no_print = no_print
        self.name = name if name is not None else 'None'
        self.unit = unit
        assert self.unit in ['s', 'ms'], \
            'The unit of time must be seconds (`s`) or milliseconds (`ms`)'

    def __enter__(self):
        self.start_time = time.time()
        self.restart_time = time.time()
        return self

    def __exit__(self, *args, **kwargs):
        self.cost_time = time.time() - self.start_time
        if not self.no_print:
            if self.unit == 's':
                print('{0:s} totally costs {1:.3f} s.'.format(
                    self.name, self.cost_time))
            elif self.unit == 'ms':
                print('{0:s} totally costs {1:.1f} ms.'.format(
                    self.name, self.cost_time * 1000))
