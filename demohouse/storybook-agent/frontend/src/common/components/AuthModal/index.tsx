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

// AuthModal.tsx - 用户认证弹窗组件

import { useState } from 'react';
import { Modal,
  Input,
  Form,
  Message,
} from '@arco-design/web-react';
import type { ModalProps } from '@arco-design/web-react';
import { validateUserToken } from '@/storybook-web/apis';

interface AuthModalProps extends Omit<ModalProps, 'onOk'> {
  onOk: (userToken: string) => void;
}

/**
 * 认证弹窗组件，用于用户输入 User Token
 */
const AuthModal: React.FC<AuthModalProps> = ({
  visible,
  onOk,
  ...props
}) => {
  // 使用Arco Form的useForm创建表单实例
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  // 处理提交
  const handleSubmit = async () => {
    try {
      // 使用Form的验证功能
      const values = await form.validate();
      const trimmedKey = values.userToken.trim();

      setLoading(true);

      // 调用User Token验证接口
      const validationResult = await validateUserToken(trimmedKey);
      
      if (validationResult.valid) {
        // 验证成功，调用成功回调
        onOk(trimmedKey);
      } else {
        // 验证失败，显示错误信息
        Message.error(validationResult.message || '请填写有效的 User Token');
      }
    } catch (err) {
      // Form验证失败或其他错误
      Message.error('请填写有效的 User Token');
    } finally {
      setLoading(false);
    }
  };

  // 表单校验规则
  const rules = {
    userToken: [
      {
        required: true,
        message: 'User Token 不能为空',
      },
    ],
  };

  return (
    <Modal
        title="请输入 User Token"
        visible={visible}
        onOk={handleSubmit}
        okButtonProps={{
          loading,
        }}
        closable={false}
        cancelButtonProps={{ style: { display: 'none' } }}
        {...props}
      > 
      <Form
        form={form}
        layout="vertical"
        colon={false}
        initialValues={{ userToken: '' }}
      >
        <Form.Item
          label="User Token"
          field="userToken"
          rules={rules.userToken}
        >
          <Input
            placeholder="请输入 User Token"
            disabled={loading}
            maxLength={200}
            style={{
              height: 40,
            }}
            onPressEnter={handleSubmit}
          />
        </Form.Item>
      </Form>

    </Modal>
  );
};

export default AuthModal;