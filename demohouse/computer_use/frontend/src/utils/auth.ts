"use client";

export function getToken() {
  // 从 querystring 获取 token
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("token");
}