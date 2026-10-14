import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Avatar } from "../Avatar";
import { Button } from "../Button";
import { ConfirmDialog } from "../ConfirmDialog";
import { ErrorState } from "../ErrorState";
import { Spinner } from "../Spinner";
import { PencilIcon, TrashIcon } from "../table/icons";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";
import { extractErrorMessage } from "../../services/api";
import { createUser, deleteUser, listUsers, updateUser } from "../../services/usersApi";
import type { User } from "../../types";
import { UserFormModal, type UserFormValues } from "./UserFormModal";

const editIconClass =
  "rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200";
const deleteIconClass =
  "rounded-lg p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300";

export function UsersTab() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [pendingDelete, setPendingDelete] = useState<User | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["admin-users"], queryFn: listUsers });

  const createMutation = useMutation({
    mutationFn: (payload: UserFormValues) => createUser(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      showToast("Usuário criado com sucesso.", "success");
      setFormOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: UserFormValues) =>
      updateUser(editing!.id, { name: payload.name, email: payload.email, role: payload.role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      showToast("Usuário atualizado com sucesso.", "success");
      setFormOpen(false);
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      showToast("Usuário excluído.", "success");
      setPendingDelete(null);
    },
    onError: (err) => {
      showToast(extractErrorMessage(err, "Não foi possível excluir o usuário."), "error");
      setPendingDelete(null);
    },
  });

  async function handleSubmit(payload: UserFormValues) {
    try {
      if (editing) {
        await updateMutation.mutateAsync(payload);
      } else {
        await createMutation.mutateAsync(payload);
      }
    } catch (err) {
      throw new Error(extractErrorMessage(err, "Não foi possível salvar o usuário."));
    }
  }

  if (isLoading) return <Spinner label="Carregando usuários..." />;
  if (isError) return <ErrorState message="Não foi possível carregar os usuários." onRetry={() => refetch()} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          + Novo usuário
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-300 dark:border-neutral-800">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
            <tr>
              <th className="px-4 py-3 font-medium">Usuário</th>
              <th className="px-4 py-3 font-medium">E-mail</th>
              <th className="px-4 py-3 font-medium">Permissão</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-300 dark:divide-neutral-800">
            {data?.map((u) => (
              <tr key={u.id}>
                <td className="flex items-center gap-2 px-4 py-3 text-neutral-800 dark:text-neutral-100">
                  <Avatar photo={u.photo} name={u.name} size={28} />
                  {u.name}
                </td>
                <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300">{u.email}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      u.role === "ADMIN"
                        ? "bg-neutral-200 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-100"
                        : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                    }`}
                  >
                    {u.role === "ADMIN" ? "Administrador" : "Usuário"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => {
                        setEditing(u);
                        setFormOpen(true);
                      }}
                      aria-label="Editar usuário"
                      className={editIconClass}
                    >
                      <PencilIcon />
                    </button>
                    <button
                      disabled={u.id === currentUser?.id}
                      onClick={() => setPendingDelete(u)}
                      aria-label="Excluir usuário"
                      className={deleteIconClass}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <UserFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={handleSubmit}
        initial={editing}
        loading={createMutation.isPending || updateMutation.isPending}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Excluir usuário?"
        message={`Esta ação não poderá ser desfeita. Todos os dados financeiros de "${pendingDelete?.name}" serão excluídos.`}
        confirmLabel="Excluir"
        loading={deleteMutation.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
      />
    </div>
  );
}
