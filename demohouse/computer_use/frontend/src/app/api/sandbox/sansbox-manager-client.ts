import axios from "axios";

export const sandboxManagerClient = axios.create({
  baseURL: process.env.SANDBOX_MANAGER_URL,
  headers: {
    "Content-Type": "application/json",
    Authorization: process.env.KEY_AUTH,
  },
});
