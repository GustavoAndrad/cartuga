import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Avatar } from "../components/Avatar";
import { Button } from "../components/Button";
import { AssistantGlyph } from "../components/assistant/AssistantAvatar";
import { AssistantSettingsForm } from "../components/assistant/AssistantSettingsForm";
import { AssistantStatusLine } from "../components/assistant/AssistantStatusLine";
import { DataExportModal } from "../components/export/DataExportModal";
import { PasswordInput } from "../components/PasswordInput";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { extractErrorMessage } from "../services/api";
import { changePassword, updateMe, updatePhoto } from "../services/usersApi";

const inputClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-cartuga-500 focus:outline-none focus:ring-1 focus:ring-cartuga-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50";
const labelClass = "mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-200";
const sectionHeadingClass = "flex items-center gap-2 text-sm font-semibold text-neutral-800 dark:text-neutral-100";
const sectionIconClass = "h-[18px] w-[18px] shrink-0 text-neutral-400 dark:text-neutral-500";

const PersonIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={sectionIconClass}>
    <path d="M12 12c2.7 0 4.9-2.2 4.9-4.9S14.7 2.2 12 2.2 7.1 4.4 7.1 7.1 9.3 12 12 12Zm0 2.5c-3.3 0-9.8 1.6-9.8 4.9v2.4h19.6v-2.4c0-3.3-6.5-4.9-9.8-4.9Z" />
  </svg>
);

const LockIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={sectionIconClass}>
    <path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Zm3 3a2 2 0 0 1 1 3.73V19a1 1 0 0 1-2 0v-2.27A2 2 0 0 1 12 13Z" />
  </svg>
);

const TableIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={sectionIconClass}>
    <path d="M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm1 2v3h14V5H5Zm0 5v4h6v-4H5Zm8 0v4h6v-4h-6Zm-8 6v3h6v-3H5Zm8 0v3h6v-3h-6Z" />
  </svg>
);

export function ProfilePage() {
  const { user, setUser } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [photo, setPhoto] = useState(user?.photo ?? "");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [dataExportOpen, setDataExportOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);

  const profileMutation = useMutation({
    mutationFn: () => updateMe({ name, email }),
    onSuccess: (updated) => {
      setUser(updated);
      showToast("Perfil atualizado com sucesso.", "success");
    },
    onError: (err) => showToast(extractErrorMessage(err, "Não foi possível atualizar o perfil."), "error"),
  });

  const photoMutation = useMutation({
    mutationFn: () => updatePhoto(photo),
    onSuccess: (updated) => {
      setUser(updated);
      showToast("Foto atualizada com sucesso.", "success");
    },
    onError: (err) => showToast(extractErrorMessage(err, "Não foi possível atualizar a foto."), "error"),
  });

  const passwordMutation = useMutation({
    mutationFn: () => changePassword({ current_password: currentPassword, new_password: newPassword }),
    onSuccess: () => {
      showToast("Senha alterada com sucesso. Você pode precisar entrar novamente em outros dispositivos.", "success");
      setCurrentPassword("");
      setNewPassword("");
      setPasswordError(null);
      queryClient.invalidateQueries();
    },
    onError: (err) => setPasswordError(extractErrorMessage(err, "Não foi possível alterar a senha.")),
  });

  function handleProfileSubmit(e: FormEvent) {
    e.preventDefault();
    profileMutation.mutate();
  }

  function handlePhotoSubmit(e: FormEvent) {
    e.preventDefault();
    photoMutation.mutate();
  }

  function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    if (newPassword.length < 8) {
      setPasswordError("A nova senha deve ter ao menos 8 caracteres.");
      return;
    }
    passwordMutation.mutate();
  }

  if (!user) return null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">Perfil</h1>

      <div className="rounded-xl border border-neutral-300 bg-[var(--color-surface)] p-8 dark:border-neutral-800 sm:p-10">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[17rem_1fr] lg:gap-10">
          <div className="flex flex-col items-center gap-4 lg:items-start lg:border-r lg:border-neutral-200 lg:pr-8 lg:dark:border-neutral-800">
            <Avatar photo={user.photo} name={user.name} size={100} />
            <div className="text-center lg:text-left">
              <p className="font-medium text-neutral-900 dark:text-neutral-50">{user.name}</p>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                {user.role === "ADMIN" ? "Administrador" : "Usuário"}
              </p>
              <p className="text-xs text-neutral-400 dark:text-neutral-500">
                membro desde {new Date(user.created_at).toLocaleDateString("pt-BR")}
              </p>
            </div>

            <form onSubmit={handlePhotoSubmit} className="flex w-full flex-col gap-2">
              <label className={labelClass}>URL da foto</label>
              <input
                value={photo}
                onChange={(e) => setPhoto(e.target.value)}
                placeholder="https://..."
                className={inputClass}
              />
              <div className="flex flex-col gap-2">
                <Button type="submit" loading={photoMutation.isPending} className="w-full">
                  {photoMutation.isPending ? "Salvando..." : "Salvar foto"}
                </Button>
                {photo && (
                  <Button type="button" variant="secondary" onClick={() => setPhoto("")} className="w-full">
                    Remover
                  </Button>
                )}
              </div>
            </form>
          </div>

          <div className="flex flex-col gap-6">
            <form onSubmit={handleProfileSubmit} className="flex flex-col gap-4">
              <h2 className={sectionHeadingClass}>
                <PersonIcon />
                Dados pessoais
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Nome</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required />
                </div>
                <div>
                  <label className={labelClass}>E-mail</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                    required
                  />
                </div>
              </div>
              <Button type="submit" loading={profileMutation.isPending} className="self-start">
                {profileMutation.isPending ? "Salvando..." : "Salvar dados"}
              </Button>
            </form>

            <form
              onSubmit={handlePasswordSubmit}
              className="flex flex-col gap-4 border-t border-neutral-200 pt-6 dark:border-neutral-800"
            >
              <h2 className={sectionHeadingClass}>
                <LockIcon />
                Segurança
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Senha atual</label>
                  <PasswordInput
                    value={currentPassword}
                    onChange={setCurrentPassword}
                    className={inputClass}
                    required
                  />
                </div>
                <div>
                  <label className={labelClass}>Nova senha</label>
                  <PasswordInput
                    value={newPassword}
                    onChange={setNewPassword}
                    className={inputClass}
                    required
                    minLength={8}
                  />
                </div>
              </div>
              {passwordError && (
                <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                  {passwordError}
                </p>
              )}
              <Button type="submit" loading={passwordMutation.isPending} className="self-start">
                {passwordMutation.isPending ? "Salvando..." : "Alterar senha"}
              </Button>
            </form>

            {/* Collapsed by default: most people set this once and forget it. */}
            <section className="flex flex-col gap-3 border-t border-neutral-200 pt-6 dark:border-neutral-800">
              <h2>
                <button
                  type="button"
                  onClick={() => setAssistantOpen((o) => !o)}
                  aria-expanded={assistantOpen}
                  aria-controls="assistant-settings"
                  className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800/50"
                >
                  <span className={`${sectionHeadingClass} flex-1`}>
                    <AssistantGlyph className={sectionIconClass} cutColor="var(--color-surface)" />
                    Assistente Cartuga
                  </span>
                  <AssistantStatusLine className="hidden max-w-[18rem] sm:inline-flex" />
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden
                    className={`h-5 w-5 shrink-0 text-neutral-400 transition-transform ${assistantOpen ? "rotate-180" : ""}`}
                  >
                    <path d="M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6 1.4-1.4Z" />
                  </svg>
                </button>
              </h2>
              {assistantOpen && (
                <div id="assistant-settings" className="flex flex-col gap-3">
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Escolha o modelo de IA do seu assistente. Com a sua própria chave você usa a sua cota, sem o limite por
                    hora do servidor.
                  </p>
                  <AssistantSettingsForm />
                </div>
              )}
            </section>

            <section className="flex flex-col gap-3 border-t border-neutral-200 pt-6 dark:border-neutral-800">
              <h2 className={sectionHeadingClass}>
                <TableIcon />
                Exportar meus dados
              </h2>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                Baixe seus lançamentos em CSV para abrir numa planilha: resumo mensal, lançamentos mês a mês, cadastro,
                parcelas e Cofre, incluindo os meses projetados. Você escolhe o período e confere uma prévia antes de
                baixar.
              </p>
              <Button type="button" variant="secondary" onClick={() => setDataExportOpen(true)} className="self-start">
                Exportar dados (CSV)
              </Button>
            </section>
          </div>
        </div>
      </div>
      <DataExportModal open={dataExportOpen} onClose={() => setDataExportOpen(false)} />
    </div>
  );
}
