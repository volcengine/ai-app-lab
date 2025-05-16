import axios from "axios";

export const plannerClient = axios.create({
  baseURL: process.env.AGENT_PLANNER_URL,
  headers: {
    "Content-Type": "application/json",
    Authorization: process.env.KEY_AUTH,
  },
});
