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
