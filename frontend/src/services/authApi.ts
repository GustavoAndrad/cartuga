import { apiClient, setAccessToken } from "./api";
import type { User } from "../types";

interface AccessTokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export async function login(email: string, password: string): Promise<AccessTokenResponse> {
  const { data } = await apiClient.post<AccessTokenResponse>("/auth/login", { email, password });
  setAccessToken(data.access_token);
  return data;
}

export async function logout(): Promise<void> {
  try {
    await apiClient.post("/auth/logout");
  } finally {
    setAccessToken(null);
  }
}
