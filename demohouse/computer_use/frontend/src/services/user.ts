import axios from "axios";

export const login = async (username: string, password: string) => {
  const response = await axios.post("/api/user/login", {
    username,
    password,
  });
  return response.data;
};

export const checkLogin = async () => {
  const response = await axios.get("/api/user/check-login");
  return response.data;
};
