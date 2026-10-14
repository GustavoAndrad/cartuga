import { useEffect, useState, type FormEvent } from "react";

import { Button } from "../Button";
import { Modal } from "../Modal";
import { PasswordInput } from "../PasswordInput";
import type { User, UserRole } from "../../types";

export interface UserFormValues {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

interface UserFormModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: UserFormValues) => Promise<void>;
  initial?: User | null;
  loading?: boolean;
}

const EMPTY: UserFormValues = { name: "", email: "", password: "", role: "USER" };

export function UserFormModal({ open, onClose, onSubmit, initial, loading }: UserFormModalProps) {
  const [form, setForm] = useState<UserFormValues>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(
        initial
          ? { name: initial.name, email: initial.email, password: "", role: initial.role }
          : EMPTY
      );
      setError(null);
    }
  }, [open, initial]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o usuário.");
    }
  }

  const inputClass =
    "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-cartuga-500 focus:outline-none focus:ring-1 focus:ring-cartuga-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50";
  const labelClass = "mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-200";

  return (
    <Modal open={open} onClose={onClose} title={initial ? "Editar usuário" : "Novo usuário"}>
      <form id="user-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className={labelClass}>Nome</label>
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>E-mail</label>
          <input
            required
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className={inputClass}
          />
        </div>
        {!initial && (
          <div>
            <label className={labelClass}>Senha inicial</label>
            <PasswordInput
              required
              minLength={8}
              value={form.password}
              onChange={(password) => setForm({ ...form, password })}
              className={inputClass}
            />
          </div>
        )}
        <div>
          <label className={labelClass}>Permissão</label>
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
            className={inputClass}
          >
            <option value="USER">Usuário</option>
            <option value="ADMIN">Administrador</option>
          </select>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </form>

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          Cancelar
        </Button>
        <Button type="submit" form="user-form" loading={loading}>
          {loading ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </Modal>
  );
}
