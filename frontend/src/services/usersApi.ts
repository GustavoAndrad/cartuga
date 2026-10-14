import { apiClient } from "./api";
import type { User, UserRole } from "../types";

export async function getMe(): Promise<User> {
  const { data } = await apiClient.get<User>("/users/me");
  return data;
}

export async function updateMe(payload: { name?: string; email?: string }): Promise<User> {
  const { data } = await apiClient.put<User>("/users/me", payload);
  return data;
}

export async function changePassword(payload: {
  current_password: string;
  new_password: string;
}): Promise<void> {
  await apiClient.put("/users/me/password", payload);
}

export async function updatePhoto(photo: string): Promise<User> {
  const { data } = await apiClient.put<User>("/users/me/photo", { photo });
  return data;
}

// ---- Admin ----

export async function listUsers(): Promise<User[]> {
  const { data } = await apiClient.get<User[]>("/users");
  return data;
}

export async function createUser(payload: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}): Promise<User> {
  const { data } = await apiClient.post<User>("/users", payload);
  return data;
}

export async function updateUser(
  id: number,
  payload: { name?: string; email?: string; role?: UserRole }
): Promise<User> {
  const { data } = await apiClient.put<User>(`/users/${id}`, payload);
  return data;
}

export async function deleteUser(id: number): Promise<void> {
  await apiClient.delete(`/users/${id}`);
}
