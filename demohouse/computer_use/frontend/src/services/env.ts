import { getToken } from "@/utils/auth";
import axios from "axios";

export const getEnv = async () => {
  const res = await axios.get("/api/get-env", {
    params: {
      token: getToken(),
    },
  });
  return res.data;
};
