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

"use client";

import { checkLogin, login } from "@/services/user";
import { Button, Form, Input, Message, Modal } from "@arco-design/web-react";
import { FC, useEffect } from "react";
import store, { actions } from "@/store";
import { useSnapshot } from "valtio";
import { Spinner } from "./spinner";
import { AxiosError } from "axios";

export const Login: FC = () => {
  const { checkingLogin } = useSnapshot(store);
  const [message, messageHolder] = Message.useMessage();

  useEffect(() => {
    const checkLoginOnStart = async () => {
      const res = await checkLogin();
      if (res.success) {
        actions.setLoggedIn(true);
      }
      actions.setCheckingLogin(false);
    };
    checkLoginOnStart();
  }, []);

  const [form] = Form.useForm<{ username: string; password: string }>();

  async function handleLogin() {
    const values = await form.validate();
    if (!values.username || !values.password) {
      message?.error?.("请输入用户名和密码");
      return;
    }
    try {
      const res = await login(values.username, values.password);
      if (res.success) {
        actions.setLoggedIn(true);
      }
    } catch (error) {
      if (error instanceof AxiosError) {
        message?.error?.(error.response?.data.message);
      }
    }
  }

  if (checkingLogin) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      {messageHolder}
      <div className="login-background h-screen"></div>
      <Modal
        className="!w-[300px]"
        title={null}
        visible={true}
        footer={null}
        hideCancel
        mask={false}
        closeIcon={false}
      >
        <Form form={form} onSubmit={handleLogin} layout="vertical">
          <Form.Item label="" field="username">
            <Input placeholder="用户名" />
          </Form.Item>
          <Form.Item label="" field="password">
            <Input.Password placeholder="密码" />
          </Form.Item>
          <Button type="primary" htmlType="submit" className="w-full">
            登录
          </Button>
        </Form>
      </Modal>
    </>
  );
};
